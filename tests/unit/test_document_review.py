"""
Unit tests for the Luxembourg financial document compliance pipeline.

Covers: language detection, PII anonymization, fund structure detection,
CSSF/UCITS/RAIF-SIF/DORA regulatory flags, risk scoring, deterministic
verification, and the report compiler — all without LLM calls or live WSS.
"""

from __future__ import annotations

import asyncio
import pytest

from genesis_swarm.document_review.language import detect_language, LUXEMBOURG_TERMS
from genesis_swarm.document_review.schemas import (
    ComplianceFlag,
    DocumentFormat,
    DocumentFrame,
    DocumentLanguage,
    FundStructure,
    PipelineContext,
    RiskScore,
    Severity,
    VerificationResult,
)
from genesis_swarm.document_review.workers import (
    w1_ingestion,
    w2_anonymizer,
    w4_cssf_auditor,
    w5_ucits_auditor,
    w6_raif_sif_auditor,
    w7_dora_auditor,
    w8_risk_detector,
    w9_verifier,
    w10_reporter,
)
from genesis_swarm.document_review.workers.w3_translator import detect_fund_structure


# ── Helpers ───────────────────────────────────────────────────────────────────

def _frame(text: str = "", fmt: DocumentFormat = DocumentFormat.TEXT) -> DocumentFrame:
    return DocumentFrame(
        session_id="test-session",
        raw_text=text,
        format_hint=fmt,
    )


def _ctx_with_text(text: str, lang: DocumentLanguage = DocumentLanguage.EN) -> PipelineContext:
    from genesis_swarm.document_review.schemas import (
        AnonymizedDocument,
        ParsedDocument,
        TranslatedDocument,
    )
    frame = _frame(text)
    ctx = PipelineContext(frame)
    ctx.parsed = ParsedDocument(
        frame_id=frame.frame_id,
        session_id=frame.session_id,
        text=text,
        page_count=1,
        format=DocumentFormat.TEXT,
        detected_language=lang,
    )
    ctx.anonymized = AnonymizedDocument(
        frame_id=frame.frame_id,
        session_id=frame.session_id,
        text=text,
    )
    ctx.translated = TranslatedDocument(
        frame_id=frame.frame_id,
        session_id=frame.session_id,
        text_en=text,
        source_language=lang,
        fund_structure=detect_fund_structure(text),
    )
    return ctx


# ── Language detection ────────────────────────────────────────────────────────

class TestLanguageDetection:
    def test_english_financial_text(self):
        text = (
            "The fund is an undertaking for collective investment in transferable securities "
            "incorporated in Luxembourg as a SICAV. The net asset value is calculated daily."
        )
        assert detect_language(text) == DocumentLanguage.EN

    def test_french_prospectus(self):
        text = (
            "Le fonds est constitué sous forme de société d'investissement à capital variable "
            "conformément à la loi luxembourgeoise. La valeur liquidative est calculée chaque jour."
        )
        assert detect_language(text) == DocumentLanguage.FR

    def test_german_fund_document(self):
        text = (
            "Der Fonds ist als Investmentgesellschaft mit variablem Kapital nach luxemburgischem "
            "Recht gegründet. Der Nettoinventarwert wird täglich berechnet."
        )
        assert detect_language(text) == DocumentLanguage.DE

    def test_short_text_returns_unk(self):
        assert detect_language("x") == DocumentLanguage.UNK

    def test_empty_text_returns_unk(self):
        assert detect_language("") == DocumentLanguage.UNK

    def test_luxembourg_terms_glossary_populated(self):
        assert "SICAV" in LUXEMBOURG_TERMS
        assert "RAIF" in LUXEMBOURG_TERMS
        assert "CSSF" in LUXEMBOURG_TERMS


# ── Fund structure detection ──────────────────────────────────────────────────

class TestFundStructureDetection:
    def test_detects_ucits(self):
        text = "This UCITS fund invests in transferable securities under the UCITS Directive."
        assert detect_fund_structure(text) == FundStructure.UCITS

    def test_detects_raif(self):
        text = "The RAIF is constituted under the loi du 23 juillet 2016 as a reserved alternative investment fund."
        assert detect_fund_structure(text) == FundStructure.RAIF

    def test_detects_sif(self):
        text = "This SIF is a specialised investment fund governed by the 2007 SIF law."
        assert detect_fund_structure(text) == FundStructure.SIF

    def test_detects_sicar(self):
        text = "The SICAR invests exclusively in risk capital under the loi du 15 juin 2004."
        assert detect_fund_structure(text) == FundStructure.SICAR

    def test_unknown_for_unrelated_text(self):
        assert detect_fund_structure("Lorem ipsum dolor sit amet.") == FundStructure.UNKNOWN


# ── Worker 1: Ingestion ───────────────────────────────────────────────────────

class TestW1Ingestion:
    @pytest.mark.asyncio
    async def test_plain_text_parsed(self):
        ctx = PipelineContext(_frame("Hello Luxembourg fund."))
        await w1_ingestion.run(ctx)
        assert ctx.parsed is not None
        assert "Luxembourg" in ctx.parsed.text
        assert ctx.parsed.format == DocumentFormat.TEXT

    @pytest.mark.asyncio
    async def test_html_stripped(self):
        html = "<html><body><p>UCITS fund prospectus</p><script>bad()</script></body></html>"
        ctx = PipelineContext(_frame(html, DocumentFormat.HTML))
        await w1_ingestion.run(ctx)
        assert ctx.parsed is not None
        assert "<p>" not in ctx.parsed.text
        assert "UCITS" in ctx.parsed.text

    @pytest.mark.asyncio
    async def test_pdf_bytes_detected(self):
        # Minimal valid PDF header
        pdf_bytes = b"%PDF-1.4 fake content"
        ctx = PipelineContext(DocumentFrame(
            session_id="s",
            raw_bytes=pdf_bytes,
            format_hint=DocumentFormat.BINARY,
        ))
        await w1_ingestion.run(ctx)
        # PDF parse may fail on fake content — errors logged, no crash
        assert ctx.parsed is not None or len(ctx.errors) > 0

    @pytest.mark.asyncio
    async def test_language_detected(self):
        text = "Le fonds est un OPCVM investi en valeurs mobilières."
        ctx = PipelineContext(_frame(text))
        await w1_ingestion.run(ctx)
        assert ctx.parsed is not None
        assert ctx.parsed.detected_language == DocumentLanguage.FR


# ── Worker 2: GDPR Anonymizer ─────────────────────────────────────────────────

class TestW2Anonymizer:
    @pytest.mark.asyncio
    async def test_email_anonymized(self):
        ctx = _ctx_with_text("Contact: john.doe@example.com for details.")
        await w2_anonymizer.run(ctx)
        assert ctx.anonymized is not None
        assert "john.doe@example.com" not in ctx.anonymized.text
        assert "[EMAIL_" in ctx.anonymized.text

    @pytest.mark.asyncio
    async def test_iban_anonymized(self):
        ctx = _ctx_with_text("Transfer to LU12 3456 7890 1234 5678 9AB.")
        await w2_anonymizer.run(ctx)
        assert ctx.anonymized is not None
        assert "LU12" not in ctx.anonymized.text

    @pytest.mark.asyncio
    async def test_pii_count_correct(self):
        ctx = _ctx_with_text(
            "Mr Jean Dupont (jean@test.lu) and Ms Marie Schmidt (marie@fund.lu)"
        )
        await w2_anonymizer.run(ctx)
        assert ctx.anonymized is not None
        assert ctx.anonymized.pii_count >= 2

    @pytest.mark.asyncio
    async def test_gdpr_clean_flag_set(self):
        ctx = _ctx_with_text("This document contains no PII.")
        await w2_anonymizer.run(ctx)
        assert ctx.anonymized is not None
        assert ctx.anonymized.gdpr_clean is True

    @pytest.mark.asyncio
    async def test_hmac_refs_unique(self):
        ctx = _ctx_with_text("Email: a@b.com and c@d.com are different.")
        await w2_anonymizer.run(ctx)
        assert ctx.anonymized is not None
        refs = [m.hmac_ref for m in ctx.anonymized.pii_matches]
        assert len(refs) == len(set(refs))


# ── Worker 4: CSSF Auditor ────────────────────────────────────────────────────

class TestW4CSSFAuditor:
    @pytest.mark.asyncio
    async def test_cloud_without_register_flagged(self):
        text = "The manager uses AWS and Azure for data processing."
        ctx = _ctx_with_text(text)
        await w4_cssf_auditor.run(ctx)
        titles = [f.title for f in ctx.flags]
        assert any("register" in t.lower() for t in titles)

    @pytest.mark.asyncio
    async def test_cloud_with_register_no_register_flag(self):
        text = (
            "The manager uses AWS. A cloud provider register is maintained listing "
            "all providers, service types, and data classifications. "
            "An exit strategy and portability plan are documented. "
            "EEA data residency is confirmed. SLA targets of 99.9% uptime are in place."
        )
        ctx = _ctx_with_text(text)
        await w4_cssf_auditor.run(ctx)
        register_flags = [f for f in ctx.flags if "register" in f.title.lower()]
        assert len(register_flags) == 0

    @pytest.mark.asyncio
    async def test_no_bcp_flagged(self):
        ctx = _ctx_with_text("The fund operates with standard procedures.")
        await w4_cssf_auditor.run(ctx)
        bcp_flags = [f for f in ctx.flags if "continuity" in f.title.lower() or "BCP" in f.title]
        assert len(bcp_flags) > 0

    @pytest.mark.asyncio
    async def test_aifm_required_for_raif(self):
        from genesis_swarm.document_review.schemas import TranslatedDocument, AnonymizedDocument, ParsedDocument
        text = "This is a RAIF reserved alternative investment fund."
        ctx = _ctx_with_text(text)
        ctx.translated = TranslatedDocument(
            frame_id=ctx.frame.frame_id,
            session_id=ctx.frame.session_id,
            text_en=text,
            source_language=DocumentLanguage.EN,
            fund_structure=FundStructure.RAIF,
        )
        await w4_cssf_auditor.run(ctx)
        aifm_flags = [f for f in ctx.flags if "AIFM" in f.title]
        assert len(aifm_flags) > 0
        assert any(f.severity == Severity.CRITICAL for f in aifm_flags)


# ── Worker 5: UCITS Auditor ───────────────────────────────────────────────────

class TestW5UCITSAuditor:
    def _ucits_ctx(self, text: str) -> PipelineContext:
        from genesis_swarm.document_review.schemas import TranslatedDocument
        ctx = _ctx_with_text(text)
        ctx.translated = TranslatedDocument(
            frame_id=ctx.frame.frame_id,
            session_id=ctx.frame.session_id,
            text_en=text,
            source_language=DocumentLanguage.EN,
            fund_structure=FundStructure.UCITS,
        )
        return ctx

    @pytest.mark.asyncio
    async def test_missing_manaco_flagged_critical(self):
        ctx = self._ucits_ctx("This UCITS fund invests in equities.")
        await w5_ucits_auditor.run(ctx)
        manaco_flags = [f for f in ctx.flags if "Management Company" in f.title]
        assert len(manaco_flags) > 0
        assert manaco_flags[0].severity == Severity.CRITICAL

    @pytest.mark.asyncio
    async def test_leverage_over_210_flagged_critical(self):
        text = (
            "The UCITS uses the commitment approach. Global exposure leverage is 250% NAV. "
            "The management company is ABC ManCo S.A. KIID is available. "
            "Dealing days: 5 per week. Eligible assets include transferable securities."
        )
        ctx = self._ucits_ctx(text)
        await w5_ucits_auditor.run(ctx)
        lev_flags = [f for f in ctx.flags if "leverage" in f.title.lower() or "210" in f.title]
        assert len(lev_flags) > 0
        assert lev_flags[0].severity == Severity.CRITICAL

    @pytest.mark.asyncio
    async def test_non_ucits_skipped_with_info(self):
        from genesis_swarm.document_review.schemas import TranslatedDocument
        ctx = _ctx_with_text("This SIF invests in real estate.")
        ctx.translated = TranslatedDocument(
            frame_id=ctx.frame.frame_id,
            session_id=ctx.frame.session_id,
            text_en="This SIF invests in real estate.",
            source_language=DocumentLanguage.EN,
            fund_structure=FundStructure.SIF,
        )
        await w5_ucits_auditor.run(ctx)
        info_flags = [f for f in ctx.flags if f.severity == Severity.INFO]
        assert len(info_flags) > 0


# ── Worker 6: RAIF/SIF Auditor ────────────────────────────────────────────────

class TestW6RAIFSIFAuditor:
    @pytest.mark.asyncio
    async def test_raif_without_aifm_flagged(self):
        from genesis_swarm.document_review.schemas import TranslatedDocument
        text = "This RAIF reserved alternative investment fund invests in private equity."
        ctx = _ctx_with_text(text)
        ctx.translated = TranslatedDocument(
            frame_id=ctx.frame.frame_id,
            session_id=ctx.frame.session_id,
            text_en=text,
            source_language=DocumentLanguage.EN,
            fund_structure=FundStructure.RAIF,
        )
        await w6_raif_sif_auditor.run(ctx)
        assert any("AIFM" in f.title for f in ctx.flags)

    @pytest.mark.asyncio
    async def test_sif_over_30pct_flagged_critical(self):
        from genesis_swarm.document_review.schemas import TranslatedDocument
        text = (
            "This SIF specialised investment fund. Single entity limit is 45% NAV. "
            "Well-informed investors only with minimum EUR 125 000 commitment. "
            "Depositary: Banque de Luxembourg."
        )
        ctx = _ctx_with_text(text)
        ctx.translated = TranslatedDocument(
            frame_id=ctx.frame.frame_id,
            session_id=ctx.frame.session_id,
            text_en=text,
            source_language=DocumentLanguage.EN,
            fund_structure=FundStructure.SIF,
        )
        await w6_raif_sif_auditor.run(ctx)
        conc_flags = [f for f in ctx.flags if "30%" in f.title or "concentration" in f.title.lower()]
        assert len(conc_flags) > 0
        assert conc_flags[0].severity == Severity.CRITICAL


# ── Worker 7: DORA Auditor ────────────────────────────────────────────────────

class TestW7DOROAuditor:
    @pytest.mark.asyncio
    async def test_missing_ict_framework_flagged(self):
        ctx = _ctx_with_text("The fund operates standard IT systems.")
        await w7_dora_auditor.run(ctx)
        ict_flags = [f for f in ctx.flags if "ICT risk management framework" in f.title]
        assert len(ict_flags) > 0
        assert ict_flags[0].severity == Severity.HIGH

    @pytest.mark.asyncio
    async def test_rto_over_4h_flagged(self):
        text = (
            "ICT risk management framework is in place. "
            "Incident classification criteria defined. "
            "Initial notification within 4 hours, intermediate report within 72 hours, "
            "final report within one month. TLPT programme established per TIBER-EU. "
            "ICT third-party risk management documented. Contractual arrangements include SLA, "
            "exit clauses and audit rights. BCP test conducted annually. RTO is 8 hours."
        )
        ctx = _ctx_with_text(text)
        await w7_dora_auditor.run(ctx)
        rto_flags = [f for f in ctx.flags if "RTO" in f.title]
        assert len(rto_flags) > 0

    @pytest.mark.asyncio
    async def test_full_dora_compliance_no_critical_flags(self):
        text = (
            "The ICT risk management framework is reviewed annually by the board. "
            "ICT incident classification follows DORA criteria. "
            "Initial notification to CSSF within 4 hours. Intermediate report at 72 hours. "
            "Final report submitted within one month of resolution. "
            "Threat-led penetration testing (TLPT) per TIBER-EU every 3 years. "
            "ICT third-party risk management policy covers all critical ICT providers. "
            "Contractual arrangements include SLA, exit clauses, and audit rights. "
            "BCP resilience test conducted annually. RTO 2 hours for critical systems."
        )
        ctx = _ctx_with_text(text)
        await w7_dora_auditor.run(ctx)
        critical = [f for f in ctx.flags if f.severity == Severity.CRITICAL]
        assert len(critical) == 0


# ── Worker 8: Risk Detector ───────────────────────────────────────────────────

class TestW8RiskDetector:
    @pytest.mark.asyncio
    async def test_risk_score_computed(self):
        ctx = _ctx_with_text("This UCITS fund. Management fee is 2%.")
        ctx.flags = [
            ComplianceFlag(
                worker="W4_CSSF",
                severity=Severity.HIGH,
                title="Test flag",
                description="desc",
                citation=__import__(
                    "genesis_swarm.document_review.schemas",
                    fromlist=["CitationRef"]
                ).CitationRef(document_id="TEST", section="1"),
                remediation="fix it",
            )
        ]
        await w8_risk_detector.run(ctx)
        assert ctx.risk_score is not None
        assert 0.0 <= ctx.risk_score.overall <= 100.0

    @pytest.mark.asyncio
    async def test_excessive_leverage_detected(self):
        text = "The fund uses gross leverage of 400% NAV."
        ctx = _ctx_with_text(text)
        await w8_risk_detector.run(ctx)
        lev_flags = [f for f in ctx.flags if "leverage" in f.title.lower()]
        assert len(lev_flags) > 0
        assert lev_flags[0].severity == Severity.CRITICAL

    @pytest.mark.asyncio
    async def test_zero_management_fee_flagged(self):
        text = "Management fee is 0%."
        ctx = _ctx_with_text(text)
        await w8_risk_detector.run(ctx)
        fee_flags = [f for f in ctx.flags if "fee" in f.title.lower()]
        assert len(fee_flags) > 0


# ── Worker 9: Deterministic Verifier ─────────────────────────────────────────

class TestW9Verifier:
    @pytest.mark.asyncio
    async def test_breach_detected_deterministically(self):
        text = "The commitment approach leverage is 350% NAV."
        ctx = _ctx_with_text(text)
        await w9_verifier.run(ctx)
        assert ctx.verification is not None
        assert not ctx.verification.passed
        assert ctx.verification.checks_failed > 0
        assert len(ctx.verification.violations) > 0

    @pytest.mark.asyncio
    async def test_compliant_values_pass(self):
        text = (
            "Single issuer limit is 5% NAV. Commitment approach leverage is 150% NAV. "
            "Gross leverage is 180% NAV."
        )
        ctx = _ctx_with_text(text)
        await w9_verifier.run(ctx)
        assert ctx.verification is not None
        assert ctx.verification.passed

    @pytest.mark.asyncio
    async def test_no_numerics_passes_with_zero_checks(self):
        ctx = _ctx_with_text("This is a narrative document with no numeric limits.")
        await w9_verifier.run(ctx)
        assert ctx.verification is not None
        assert ctx.verification.checks_run == 0
        assert ctx.verification.passed


# ── Worker 10: Report Compiler ────────────────────────────────────────────────

class TestW10Reporter:
    @pytest.mark.asyncio
    async def test_report_generated(self):
        ctx = _ctx_with_text("UCITS fund prospectus.")
        ctx.risk_score = RiskScore(
            overall=20.0, leverage=10.0, liquidity=5.0,
            governance=5.0, ict=0.0, esg=0.0,
        )
        ctx.verification = VerificationResult(passed=True, checks_run=3, checks_failed=0)
        report = await w10_reporter.run(ctx)
        assert report is not None
        assert report.session_id == "test-session"
        assert report.sign_off_required is True

    @pytest.mark.asyncio
    async def test_critical_flag_recommendation_blocks(self):
        from genesis_swarm.document_review.schemas import CitationRef
        ctx = _ctx_with_text("Test.")
        ctx.flags = [ComplianceFlag(
            worker="W5_UCITS",
            severity=Severity.CRITICAL,
            title="Critical issue",
            description="desc",
            citation=CitationRef(document_id="X", section="Y"),
            remediation="fix",
        )]
        ctx.risk_score = RiskScore(overall=80.0, leverage=80.0, liquidity=0.0,
                                   governance=0.0, ict=0.0, esg=0.0)
        ctx.verification = VerificationResult(passed=False, checks_run=1, checks_failed=1)
        report = await w10_reporter.run(ctx)
        assert "BLOCK" in report.recommendation

    @pytest.mark.asyncio
    async def test_clean_document_recommendation(self):
        ctx = _ctx_with_text("Compliant fund document.")
        ctx.risk_score = RiskScore(overall=0.0, leverage=0.0, liquidity=0.0,
                                   governance=0.0, ict=0.0, esg=0.0)
        ctx.verification = VerificationResult(passed=True, checks_run=5, checks_failed=0)
        report = await w10_reporter.run(ctx)
        assert "CLEAN PASS" in report.recommendation or "REVIEW" in report.recommendation

    @pytest.mark.asyncio
    async def test_report_serializes_to_json(self):
        import json
        ctx = _ctx_with_text("Test.")
        ctx.risk_score = RiskScore(overall=0.0, leverage=0.0, liquidity=0.0,
                                   governance=0.0, ict=0.0, esg=0.0)
        ctx.verification = VerificationResult(passed=True, checks_run=0, checks_failed=0)
        report = await w10_reporter.run(ctx)
        json_str = json.dumps(report.model_dump(mode="json"))
        parsed = json.loads(json_str)
        assert parsed["sign_off_required"] is True
        assert "report_id" in parsed


# =============================================================================
# New infrastructure: Auth, RAG Store, Audit Trail, PDF Export
# =============================================================================

import os
import tempfile

# ── Auth ─────────────────────────────────────────────────────────────────────

class TestAuth:
    def test_issue_and_verify_valid_token(self):
        from genesis_swarm.document_review.auth import issue_token, verify_token
        tok = issue_token("test-subject")
        ok, sub = verify_token(tok)
        assert ok
        assert sub == "test-subject"

    def test_rejects_tampered_token(self):
        from genesis_swarm.document_review.auth import issue_token, verify_token
        tok = issue_token("svc") + "tampered"
        ok, _ = verify_token(tok)
        assert not ok

    def test_rejects_random_string(self):
        from genesis_swarm.document_review.auth import verify_token
        ok, reason = verify_token("not-a-token")
        assert not ok
        assert reason == "invalid_or_expired_token"

    def test_extract_bearer_header(self):
        from genesis_swarm.document_review.auth import extract_token
        tok = extract_token({"authorization": "Bearer my.jwt.here"}, {})
        assert tok == "my.jwt.here"

    def test_extract_query_param_token(self):
        from genesis_swarm.document_review.auth import extract_token
        tok = extract_token({}, {"token": "abc.def.ghi"})
        assert tok == "abc.def.ghi"

    def test_extract_query_api_key(self):
        from genesis_swarm.document_review.auth import extract_token
        tok = extract_token({}, {"api_key": "raw-key-123"})
        assert tok == "raw-key-123"

    def test_no_token_returns_none(self):
        from genesis_swarm.document_review.auth import extract_token
        assert extract_token({}, {}) is None

    def test_auth_disabled_always_passes(self, monkeypatch):
        import genesis_swarm.document_review.auth as auth_mod
        monkeypatch.setattr(auth_mod, "AUTH_DISABLED", True)
        ok, sub = auth_mod.verify_token("garbage")
        assert ok
        assert sub == "auth-disabled"


# ── RAG Store ─────────────────────────────────────────────────────────────────

class TestRagStore:
    def test_corpus_not_empty(self):
        from genesis_swarm.document_review.rag_store import corpus_size
        assert corpus_size() >= 40

    def test_cloud_register_query_returns_cssf(self):
        from genesis_swarm.document_review.rag_store import query
        hits = query("cloud provider register outsourcing", k=3)
        assert hits
        doc_ids = [h.doc_id for h in hits]
        assert any("22/806" in d for d in doc_ids)

    def test_dora_reporting_query(self):
        from genesis_swarm.document_review.rag_store import query
        hits = query("ICT incident reporting 4 hours initial notification", k=3)
        assert hits
        assert any("DORA" in h.doc_id for h in hits)

    def test_ucits_concentration_query(self):
        from genesis_swarm.document_review.rag_store import query
        hits = query("UCITS 5 10 40 rule transferable securities same issuer", k=3)
        assert hits
        assert any("UCITS" in h.doc_id for h in hits)

    def test_zero_score_excluded(self):
        from genesis_swarm.document_review.rag_store import query
        # Completely unrelated query — scores should still be > 0 for top hits
        # but the function must not crash
        hits = query("purple elephant completely unrelated", k=3)
        # All returned hits (if any) must have positive scores
        assert all(h.score > 0 for h in hits)

    def test_citation_format(self):
        from genesis_swarm.document_review.rag_store import query
        hits = query("depositary appointment Luxembourg AIF", k=1)
        if hits:
            assert hits[0].citation.startswith("Citation:")


# ── Audit Trail ───────────────────────────────────────────────────────────────

class TestAuditTrail:
    def setup_method(self):
        import genesis_swarm.document_review.audit_trail as at
        # Point to a fresh in-memory/temp DB for each test
        self._orig_path = at._DB_PATH
        fd, self._tmp = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        at._DB_PATH = self._tmp
        at._conn = None  # force reconnect

    def teardown_method(self):
        import genesis_swarm.document_review.audit_trail as at
        if at._conn:
            at._conn.close()
            at._conn = None
        at._DB_PATH = self._orig_path
        try:
            os.unlink(self._tmp)
        except OSError:
            pass

    def test_append_returns_entry(self):
        from genesis_swarm.document_review import audit_trail
        e = audit_trail.append("s1", "TEST", data={"x": 1})
        assert e.seq == 1
        assert e.session_id == "s1"
        assert e.event_type == "TEST"
        assert len(e.hmac_hex) == 64

    def test_chain_grows_monotonically(self):
        from genesis_swarm.document_review import audit_trail
        e1 = audit_trail.append("s", "E1")
        e2 = audit_trail.append("s", "E2")
        e3 = audit_trail.append("s", "E3")
        assert e1.seq < e2.seq < e3.seq

    def test_chain_verification_passes(self):
        from genesis_swarm.document_review import audit_trail
        audit_trail.append("s", "A")
        audit_trail.append("s", "B")
        ok, broken = audit_trail.verify_chain()
        assert ok
        assert broken == -1

    def test_get_session_trail(self):
        from genesis_swarm.document_review import audit_trail
        audit_trail.append("sess-X", "OPEN")
        audit_trail.append("sess-X", "REPORT")
        audit_trail.append("sess-Y", "OPEN")
        trail = audit_trail.get_session_trail("sess-X")
        assert len(trail) == 2
        assert all(e.session_id == "sess-X" for e in trail)

    def test_prev_hmac_chain_links(self):
        from genesis_swarm.document_review import audit_trail
        e1 = audit_trail.append("s", "E1")
        e2 = audit_trail.append("s", "E2")
        assert e2.prev_hmac == e1.hmac_hex


# ── PDF Export ────────────────────────────────────────────────────────────────

from genesis_swarm.document_review.schemas import (
    CitationRef, ComplianceReport, DocumentFormat, DocumentLanguage,
    FundStructure, RiskScore, Severity, VerificationResult,
)


def _make_report(**overrides) -> ComplianceReport:
    defaults: dict = dict(
        session_id="pdf-test-session",
        frame_id="frame-pdf-001",
        filename="test_prospectus.pdf",
        format=DocumentFormat.PDF,
        source_language=DocumentLanguage.EN,
        page_count=10,
        fund_structure=FundStructure.UCITS,
        pii_count=2,
        gdpr_clean=True,
        flags=(),
        critical_count=0, high_count=0, medium_count=0, low_count=0,
        risk_score=RiskScore(overall=15.0, leverage=5.0, liquidity=10.0,
                             governance=20.0, ict=15.0, esg=5.0),
        verification=VerificationResult(passed=True, checks_run=10, checks_failed=0),
        sign_off_required=True,
        recommendation="CLEAN PASS — no issues.",
        content_hash="a" * 64,
    )
    defaults.update(overrides)
    return ComplianceReport(**defaults)


class TestPdfExport:
    def test_pdf_bytes_valid_header(self):
        from genesis_swarm.document_review.pdf_export import generate_pdf
        pdf = generate_pdf(_make_report())
        assert pdf[:4] == b"%PDF"

    def test_pdf_non_trivial_size(self):
        from genesis_swarm.document_review.pdf_export import generate_pdf
        pdf = generate_pdf(_make_report())
        assert len(pdf) > 4_000

    def test_pdf_with_flags(self):
        from genesis_swarm.document_review.pdf_export import generate_pdf
        flag = ComplianceFlag(
            worker="W4_CSSF",
            severity=Severity.CRITICAL,
            title="Missing AIFM authorisation",
            description="No AIFM reference.",
            citation=CitationRef(document_id="CSSF 14/592", section="Section 2",
                                 page=None, article="Art. 2"),
            remediation="Appoint an authorised AIFM.",
            raw_excerpt="",
        )
        report = _make_report(
            flags=(flag,),
            critical_count=1,
            recommendation="BLOCK — CRITICAL issues.",
        )
        pdf = generate_pdf(report)
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 5_000

    def test_pdf_block_verdict(self):
        from genesis_swarm.document_review.pdf_export import generate_pdf
        report = _make_report(
            critical_count=2,
            recommendation="⛔ BLOCK — 2 CRITICAL flags.",
        )
        pdf = generate_pdf(report)
        assert len(pdf) > 4_000

    def test_pdf_with_verification_failure(self):
        from genesis_swarm.document_review.pdf_export import generate_pdf
        vr = VerificationResult(
            passed=False, checks_run=10, checks_failed=1,
            violations=(
                "gross_leverage: actual 350% exceeds 300% limit (CDR 231/2013 Art. 111(1)(b))",
            ),
        )
        report = _make_report(verification=vr)
        pdf = generate_pdf(report)
        assert pdf[:4] == b"%PDF"
