// Static snapshot of the most recently sealed Book of Genesis.
// Used as a fallback when Vercel KV is not provisioned or has expired the entries.
// Regenerate with: curl -s -X POST "https://.../api/book/seal?auth=...&full=1" > /tmp/book.json && node scripts/write-snapshot.js

import type { BookManifest, BookEntry } from "@/lib/book"

export const BOOK_SNAPSHOT_MANIFEST: BookManifest = {
  "version": "GENESIS-BOOK-I",
  "sealed_at": "2026-05-30T04:55:51.311Z",
  "reveal_at": "2027-11-21T04:55:51.312Z",
  "total_prophecies": 100,
  "vindications": 0,
  "misses": 0,
  "pending": 100,
  "merkle_root": "dd3a448c450942ee8e8d97f294f8c89dc4df03ad0240a25897d6409864e1f687",
  "ots_status": "CALENDAR_ATTESTED",
  "ots_receipt": "8AhZ+p1bFZ2D0wjxIPnKluSoCbdbDf5EmSRrRvSVbFxncefEdSwUbWmemORoCPAQ4PtV+yL+xIqwboVW7S1jLAjxIOwlP2Fg6NSFe0VzE4hALSoEVvgsZtnstyjHI7Kk/06TCPAgtvLMMHE6paYwHQfLLokgBwpHUoEl1I7yD/QnQtZ0mQUI8QRqGm3e8Aihr68P8c+6oACD3+MNLvkMji4taHR0cHM6Ly9hbGljZS5idGMuY2FsZW5kYXIub3BlbnRpbWVzdGFtcHMub3Jn",
  "ots_calendar": "https://a.pool.opentimestamps.org",
  "ots_submitted_at": "2026-05-30T04:55:58.898Z"
}

export const BOOK_SNAPSHOT_ENTRIES: BookEntry[] = [
  {
    "rank": 1,
    "candidate": {
      "name": "UBS Europe SE",
      "jurisdiction": "DE",
      "category": "bank"
    },
    "pre_crime_index": 60,
    "genesis_score": 40,
    "trajectory": "RISING",
    "pattern_match": "archegos",
    "forecast": "Elevated operational-risk indicators related to business operations and risk management practices necessitate heightened supervisory attention.",
    "merkle_root": "99983ad3fff2f2393afa2392cdc7b0193b15c1a56c8d005e95529ee854a38fb5",
    "signature": "566cbfbb88096e47ac810043bf25a022cce3e5cb94f4b355407b1297825fbbca",
    "prophecy_id": "99983ad3fff2"
  },
  {
    "rank": 2,
    "candidate": {
      "name": "Deutsche Bank AG, London Branch",
      "jurisdiction": "GB",
      "category": "bank"
    },
    "pre_crime_index": 55,
    "genesis_score": 45,
    "trajectory": "RISING",
    "pattern_match": "wirecard",
    "forecast": "Significant operational-risk indicators related to governance and risk management practices require immediate supervisory monitoring.",
    "merkle_root": "578a618e28db37195e901643aae77a243ec86d43258a02a77431ee9185db812c",
    "signature": "d0b9dc28cf7a8ada5b321a80a59c7e4d55f742f7984d394c9b1318a003b5df70",
    "prophecy_id": "578a618e28db"
  },
  {
    "rank": 3,
    "candidate": {
      "name": "DWS Group GmbH & Co. KGaA",
      "jurisdiction": "DE",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 50,
    "genesis_score": 55,
    "trajectory": "FALLING",
    "forecast": "DWS Group GmbH & Co. KGaA's operational-risk indicators are higher due to recent challenges, and supervisory monitoring may focus on its efforts to address governance gaps and improve its risk management practices.",
    "merkle_root": "fc192fcacf36232e8b4f6d4fbbc08f87cdcf92697d368f703b9057153d1b7a95",
    "signature": "345fa0c54e1a2584cbab08054b494c2a031cac9db2da08229bce9724f35cfda9",
    "prophecy_id": "fc192fcacf36"
  },
  {
    "rank": 4,
    "candidate": {
      "name": "KBC Asset Management N.V.",
      "jurisdiction": "BE",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 50,
    "genesis_score": 50,
    "trajectory": "RISING",
    "forecast": "Structural concerns related to risk management and governance practices require prompt supervisory monitoring.",
    "merkle_root": "81695a07cb425504e3dc8c4976e0979aa7f0a34cdb5c27b81d65e2b7977a3441",
    "signature": "2f35bbebffa3d0f719eab76a04e39398c259b0e5d74264379f4fdf4e05ab06db",
    "prophecy_id": "81695a07cb42"
  },
  {
    "rank": 5,
    "candidate": {
      "name": "Banque Internationale à Luxembourg",
      "lei": "5493000F4ZO33MV32P92",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 50,
    "genesis_score": 50,
    "trajectory": "RISING",
    "forecast": "Structural concerns related to risk management and governance practices require prompt supervisory monitoring.",
    "merkle_root": "eff9d34473ea21744ce3719af3e3356a51f0dd4481f989161d591534548a52dc",
    "signature": "dc4b86cd8b9922732d6f8731e8a29c49dc13a5b5c99d25c7cd09dddb7b0006a5",
    "prophecy_id": "eff9d34473ea"
  },
  {
    "rank": 6,
    "candidate": {
      "name": "Société Générale Luxembourg",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 48,
    "genesis_score": 52,
    "trajectory": "RISING",
    "forecast": "Increasing operational-risk indicators related to business operations and risk management practices warrant supervisory attention.",
    "merkle_root": "3e68fdc6f81f49dcc9cae0b7d8d892a3e90ce5bcc10c8a25c94a831b6a1659f7",
    "signature": "30f8740d19a26df5ee095bc613a8159f71bf916a7c17b48a48b83145279889ea",
    "prophecy_id": "3e68fdc6f81f"
  },
  {
    "rank": 7,
    "candidate": {
      "name": "ABN AMRO Bank N.V.",
      "jurisdiction": "NL",
      "category": "bank"
    },
    "pre_crime_index": 48,
    "genesis_score": 52,
    "trajectory": "RISING",
    "forecast": "Increasing operational-risk indicators related to business operations and risk management practices warrant supervisory attention.",
    "merkle_root": "4c20677e9fcca39b7215f61996a7fd23bb42b511185ba3992d8718e052d4cfce",
    "signature": "e4b6262240f7903e967fc0bb03e2c891f4bda9a0146c133e36f78510a95485b1",
    "prophecy_id": "4c20677e9fcc"
  },
  {
    "rank": 8,
    "candidate": {
      "name": "Anima Holding S.p.A.",
      "jurisdiction": "IT",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 45,
    "genesis_score": 60,
    "trajectory": "FALLING",
    "forecast": "Anima Holding S.p.A.'s operational-risk indicators are higher due to recent challenges, and supervisory monitoring may focus on its efforts to address governance gaps and improve its risk management practices.",
    "merkle_root": "f990c5c556da87841db35b592aeb409e0991f7d6b505e4712779f13b571ae1c9",
    "signature": "7f9f8aa36f44b98033adbaa9a6cdbacdee3b4018fdffb5001b9fd9b347a702ce",
    "prophecy_id": "f990c5c556da"
  },
  {
    "rank": 9,
    "candidate": {
      "name": "Allfunds Bank International",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 45,
    "genesis_score": 55,
    "trajectory": "RISING",
    "forecast": "Increasing operational-risk indicators related to business growth and complexity warrant heightened supervisory attention.",
    "merkle_root": "8a671fd59ac6dff2e1d2e6423d16be3cb5bcdc70dc02360db5d63a327f9abe33",
    "signature": "b652d22846de21b8757e2ca5231cc46167e78d47f5340d65317c45de1519c39d",
    "prophecy_id": "8a671fd59ac6"
  },
  {
    "rank": 10,
    "candidate": {
      "name": "BNP Paribas S.A. Luxembourg",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 42,
    "genesis_score": 58,
    "trajectory": "HOLDING",
    "forecast": "Operational-risk indicators suggest a need for ongoing oversight of business operations and risk management practices.",
    "merkle_root": "f5d659a92b9b84a06b3070afeb1a7013534c47ef5a1a91306f1b2977241f4e77",
    "signature": "6130213925badecb099551f5e3df54bac8063473ebf9d0242c75ed628d7ec32b",
    "prophecy_id": "f5d659a92b9b"
  },
  {
    "rank": 11,
    "candidate": {
      "name": "BNP Paribas Asset Management Holding",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 40,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "BNP Paribas Asset Management Holding's operational-risk indicators are higher due to its large size and complexity, and supervisory monitoring may focus on its risk management and governance practices.",
    "merkle_root": "8f7df3a4045fd57878eb9f71180717fa50e2fbd6ee10cfe9f94f2f7c3e3f06f9",
    "signature": "06430985f114740b463a07857c8fe5fd3ec0f75a3d1c2650e982c0c655d2973c",
    "prophecy_id": "8f7df3a4045f"
  },
  {
    "rank": 12,
    "candidate": {
      "name": "La Française AM",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 40,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "La Française AM's operational-risk indicators are higher due to its complex operations and global reach, and supervisory monitoring may be necessary to address potential governance gaps and improve its risk management practices.",
    "merkle_root": "0eceb372a51b88c0749e121b9270d471092a52a9f4fbaaadc85567d8c5934212",
    "signature": "f4d84e9c554fe554fca232cfdd2edbe56e9ccec4d17e0c5d9c1f9d0a05c6fec7",
    "prophecy_id": "0eceb372a51b"
  },
  {
    "rank": 13,
    "candidate": {
      "name": "Lyxor International Asset Management",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 40,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Lyxor International Asset Management's operational-risk indicators are higher due to its complex operations and global reach, and supervisory monitoring may be necessary to address potential governance gaps and improve its risk management practices.",
    "merkle_root": "c2b00406021d96687227159d6e3bc3282da16afeddef50fc470d2764dfb79308",
    "signature": "13faa156d3907e5cea8a3002bd571f390c1d363edeaa1ab62158ace7285c02bf",
    "prophecy_id": "c2b00406021d"
  },
  {
    "rank": 14,
    "candidate": {
      "name": "Azimut Investments S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 40,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Azimut Investments S.A.'s operational-risk indicators are higher due to its complex operations and global reach, and supervisory monitoring may be necessary to address potential governance gaps and improve its risk management practices.",
    "merkle_root": "439b2f2b050a45157eb340d842cadf1b5abb8a8707896393d0889dbbd32c3575",
    "signature": "59883882832c979e6c72ef096c728582135b6dc6430e5cd86445b2f9aa316a23",
    "prophecy_id": "439b2f2b050a"
  },
  {
    "rank": 15,
    "candidate": {
      "name": "Liontrust Investment Partners",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 40,
    "genesis_score": 60,
    "trajectory": "HOLDING",
    "forecast": "Operational-risk indicators suggest a need for enhanced oversight of business operations and risk management practices.",
    "merkle_root": "480c745843dbc920ff66e1f4d6af7a637a331da9dcc2b3afa234d35c758b2ebf",
    "signature": "c817c3e9641dfb6d606a213393d5a33acc7ea04ce3033322bd7ce8b1c1a1db6d",
    "prophecy_id": "480c745843db"
  },
  {
    "rank": 16,
    "candidate": {
      "name": "Universal-Investment-Gesellschaft mbH",
      "jurisdiction": "DE",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 38,
    "genesis_score": 62,
    "trajectory": "HOLDING",
    "forecast": "Risk management frameworks may benefit from enhanced oversight to mitigate potential operational risks.",
    "merkle_root": "48ffff7500d41aa74486e31e22c5100d8db6a6abc4c898d8bbb0a2a56b520a8b",
    "signature": "c54b8db47e7162899934f0bc87a489dbbfbf2f39b6a123c1043a12d64513ca25",
    "prophecy_id": "48ffff7500d4"
  },
  {
    "rank": 17,
    "candidate": {
      "name": "Quintet Private Bank (Europe) S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 38,
    "genesis_score": 62,
    "trajectory": "HOLDING",
    "forecast": "Risk management frameworks may benefit from enhanced oversight to mitigate potential operational risks.",
    "merkle_root": "db66b25c8921cd6167abddb2e212000cadb73e951da0634af6880193ec5d0cd2",
    "signature": "a51e4762b29c293921eb80925bac1410b3a2c44c73a9e2dfda1f117a51c8a923",
    "prophecy_id": "db66b25c8921"
  },
  {
    "rank": 18,
    "candidate": {
      "name": "AXA Investment Managers Paris",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "AXA Investment Managers Paris's operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its large and complex operations.",
    "merkle_root": "9e7c3616f45f29a65dba7ada5294bd9ba2e6593772044edb0585c522b674ff83",
    "signature": "a5aff1cb2a0d1e202844d785ba3a83322b52cfbb7d54c9a8acb960fe5face11a",
    "prophecy_id": "9e7c3616f45f"
  },
  {
    "rank": 19,
    "candidate": {
      "name": "M&G Investments",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "M&G Investments' operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices and governance framework to mitigate potential structural concerns.",
    "merkle_root": "0169909a20cd1ce1adec9cfb3d3c9a032a0818bca3f16683151cf6697fd342e8",
    "signature": "c4da38ece2237d656110dbfe4781e9a4325477a8c3455cbde8e2f222ce23c461",
    "prophecy_id": "0169909a20cd"
  },
  {
    "rank": 20,
    "candidate": {
      "name": "NN Investment Partners B.V.",
      "jurisdiction": "NL",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "NN Investment Partners B.V.'s operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices and governance framework to mitigate potential structural concerns.",
    "merkle_root": "f3e34b1934695f1f88157707994c0a6e6d46ad2bfbf22553c2752ca3b49c43bd",
    "signature": "4c37534700145835a93dc819ff2b4449d3fa90857daa8f3328e227dc06b5790b",
    "prophecy_id": "f3e34b193469"
  },
  {
    "rank": 21,
    "candidate": {
      "name": "ODDO BHF Asset Management",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "ODDO BHF Asset Management's operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices and governance framework to mitigate potential structural concerns.",
    "merkle_root": "c00a72fea2b8fc562893a09f0ec6594a685e3da110b95a305720ab05f929f472",
    "signature": "8e08085a028ff9883702bb2f86eae36dea9011a30e1c51a43adae35c159fad57",
    "prophecy_id": "c00a72fea2b8"
  },
  {
    "rank": 22,
    "candidate": {
      "name": "CACEIS Investor Services",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "CACEIS Investor Services' operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices and governance framework to mitigate potential structural concerns.",
    "merkle_root": "8f227322be200b9e61de66a4281982e12fe273dace6c3ee06a110ac882e57a97",
    "signature": "7853a596e82928b7ed4e48268a34f4d685af5d3abe236b3c39f3ea7b5240c79d",
    "prophecy_id": "8f227322be20"
  },
  {
    "rank": 23,
    "candidate": {
      "name": "Eurizon Capital S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "Eurizon Capital S.A.'s operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices and governance framework to mitigate potential structural concerns.",
    "merkle_root": "5cb40bc244c3fb776a5cdc11af964c68ecd4855fac92c12a0e705a75581f21dc",
    "signature": "56ed3e37ab725d41af7e151527ba316cdf9b6319dc5cd79d9b95573627b3566e",
    "prophecy_id": "5cb40bc244c3"
  },
  {
    "rank": 24,
    "candidate": {
      "name": "Deka Investment GmbH",
      "jurisdiction": "DE",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 35,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Structural concerns related to investment practices may require supervisory attention.",
    "merkle_root": "24fc1b11deeaa9b754c340a4307b3dbbebeb6854d8947632d50871de9eb1e8d6",
    "signature": "b9a7a10e4c89436dbe2784975feb3d066c5b86e4097d8cecdc3cd50bb98e8961",
    "prophecy_id": "24fc1b11deea"
  },
  {
    "rank": 25,
    "candidate": {
      "name": "Rabobank",
      "jurisdiction": "NL",
      "category": "bank"
    },
    "pre_crime_index": 35,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Structural concerns related to investment practices may require supervisory attention.",
    "merkle_root": "fc48a18e076b50fa2af4c5e2fbc409777f239998e731f596227bbfa06bfbec71",
    "signature": "4a8b2e5a1f6ad71486b70a0339bdaf393c1ebd3647ac0da7cc3d75849f9aefef",
    "prophecy_id": "fc48a18e076b"
  },
  {
    "rank": 26,
    "candidate": {
      "name": "Union Investment Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 32,
    "genesis_score": 68,
    "trajectory": "HOLDING",
    "forecast": "Supervisory monitoring is warranted due to potential governance gaps in risk management practices.",
    "merkle_root": "c3fa853f1a60361ec76330d92d1f63e7453bffa3afc338327543ae82d8d5cd4d",
    "signature": "a4de05a07976f112facd07fb99ea6f9d076ce91997f7f438a194ef90b3d0ad81",
    "prophecy_id": "c3fa853f1a60"
  },
  {
    "rank": 27,
    "candidate": {
      "name": "Amundi Asset Management",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Amundi Asset Management's operational-risk indicators are moderate, and supervisory monitoring may focus on its risk management practices to mitigate potential structural concerns.",
    "merkle_root": "ded092de10a5f90ed1e8dff62e3e6586dbfcafd50673c288474b6719dc994930",
    "signature": "9858ba3b4cf88c6089343b21d95b1a0c30060769a831d4372fb5bfd65ebc3cdb",
    "prophecy_id": "ded092de10a5"
  },
  {
    "rank": 28,
    "candidate": {
      "name": "Allianz Global Investors GmbH",
      "jurisdiction": "DE",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Allianz Global Investors GmbH's operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its global operations and complex product offerings.",
    "merkle_root": "0922e86fc1b4505bc3182072659f377d108a9abf803dbc4bd77e6e6b928bf44a",
    "signature": "21df24e96e0f02e7914ea68e49b7bd20ad2e4ca11227bdbf7b5a4850a5045adb",
    "prophecy_id": "0922e86fc1b4"
  },
  {
    "rank": 29,
    "candidate": {
      "name": "Carmignac Gestion Luxembourg",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Carmignac Gestion Luxembourg's operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its complex investment strategies and global operations.",
    "merkle_root": "268a996a19a408ad83b357c257fa44805932352d9d9a55838f111fbd72713398",
    "signature": "0a49b7b01d21d6c33dc2319c3afb480bb791e7e872277d041932c6e22ea73661",
    "prophecy_id": "268a996a19a4"
  },
  {
    "rank": 30,
    "candidate": {
      "name": "Robeco Institutional Asset Management",
      "jurisdiction": "NL",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Robeco Institutional Asset Management's operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its complex investment strategies and global operations.",
    "merkle_root": "62278b73a0b322990a8ab01448ce01858aca7ada67c96c0a45f75791450cfa8d",
    "signature": "00de7e72a8c4fbf4e82572d7b4b788abd385a78f5711e53d75459af77ed0891a",
    "prophecy_id": "62278b73a0b3"
  },
  {
    "rank": 31,
    "candidate": {
      "name": "Comgest S.A.",
      "jurisdiction": "FR",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Comgest S.A.'s operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its complex investment strategies and global operations.",
    "merkle_root": "87660f008f521486175796854ab44cab5cbcb698f3adcccf586f5a7a739c4848",
    "signature": "13e0752b4322dec4fa07fac42b546df8f73fe40fc102a940da020cbfab1eaba3",
    "prophecy_id": "87660f008f52"
  },
  {
    "rank": 32,
    "candidate": {
      "name": "Mirabaud Asset Management (Europe)",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Mirabaud Asset Management (Europe)'s operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its complex investment strategies and global operations.",
    "merkle_root": "fb330eaae6f14d7313044c9e252d3e1b12e4904a96624cc5e8e767517f9cfaaa",
    "signature": "d6841c69731f7551bb16d48f1eded0d5dcd44457af23a95c7de81ccfc7c4cfd4",
    "prophecy_id": "fb330eaae6f1"
  },
  {
    "rank": 33,
    "candidate": {
      "name": "Banca Generali Fund Management",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Banca Generali Fund Management's operational-risk indicators are moderate, and supervisory monitoring may be necessary to address potential risks associated with its complex investment strategies and global operations.",
    "merkle_root": "21e8797ee22218b0a31faad7ecca3b47edef8de9c9c6f1d3ec205532da4283a8",
    "signature": "a3c9d4c10689c87c5eed74e95a046dbdfa4914ef738c9e6e71e25cd575f71ee5",
    "prophecy_id": "21e8797ee222"
  },
  {
    "rank": 34,
    "candidate": {
      "name": "Jupiter Asset Management",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 30,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "Investment strategies and risk management practices warrant regular review to ensure alignment with regulatory expectations.",
    "merkle_root": "b48c99a49c564c6374145c62a8ba3b5d686e4452d0aa9af973b06b0cdaeaea41",
    "signature": "04b48e4e1fee390a539d9dd65b2aee00ee2c57663674419d326861526c56ef11",
    "prophecy_id": "b48c99a49c56"
  },
  {
    "rank": 35,
    "candidate": {
      "name": "Banque de Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 70,
    "trajectory": "HOLDING",
    "forecast": "Investment strategies and risk management practices warrant regular review to ensure alignment with regulatory expectations.",
    "merkle_root": "3ae88f673f2c579a352fa7071eb49b48555a302bef4dc18b65f9a76e5068397b",
    "signature": "917ef9a22963042a86d95c30645a43c82240f91214efc7722aae07ff4a9fd85a",
    "prophecy_id": "3ae88f673f2c"
  },
  {
    "rank": 36,
    "candidate": {
      "name": "Nordea Bank Abp",
      "jurisdiction": "FI",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "No material public signal at scoring time.",
    "merkle_root": "ef5d284c342e619c78e9d61384b380def2616d240ac8d96718e203560f4f8b4e",
    "signature": "76074cc6b7d4028ef96466d1991f626d2bae13fe7fe3f6ca37a93aadf6378aaa",
    "prophecy_id": "ef5d284c342e"
  },
  {
    "rank": 37,
    "candidate": {
      "name": "Danske Bank A/S",
      "jurisdiction": "DK",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "8d7e5e7859ef8742e6177fda5e747022774c292f99514813a576fcbd2c62aafe",
    "signature": "eb6441cb0453d604a1db3811b9af13fb17528a53900100959e79fb1d4537b734",
    "prophecy_id": "8d7e5e7859ef"
  },
  {
    "rank": 38,
    "candidate": {
      "name": "SEB AB",
      "jurisdiction": "SE",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "618104b5d67970a626bd350a777335540495174439edc03235dc766fb6675ef8",
    "signature": "02b2372234e7b4183de2a9c0677f7d47ba9a540cbaa13a72881897501274ede4",
    "prophecy_id": "618104b5d679"
  },
  {
    "rank": 39,
    "candidate": {
      "name": "Banco Santander Luxembourg",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "ee26a194765f13ce7695295383b5526453c40cf422f0dcded7a619f0eac33518",
    "signature": "fedd5f8001fc38e39c3f9227565bcfa5b652fc38a4ce64d14a572ea6d722bebe",
    "prophecy_id": "ee26a194765f"
  },
  {
    "rank": 40,
    "candidate": {
      "name": "Unicredit Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "dd0009a0d2f818611147474aa81100bb5e68beca698068040ff62e625efc4eb3",
    "signature": "1666759e3dcbf6b7144fa0d42ed39742a5dfe8b11558e33ceecb3e111127413a",
    "prophecy_id": "dd0009a0d2f8"
  },
  {
    "rank": 41,
    "candidate": {
      "name": "Intesa Sanpaolo Bank Luxembourg",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "0901effed131bbdbfd01ecae1908dc679b1c18000bea37dd746148af4315343e",
    "signature": "68826a4c6d954567f219fb2c43ea1251a787aa01c376feac7f1d71aa77d0bf84",
    "prophecy_id": "0901effed131"
  },
  {
    "rank": 42,
    "candidate": {
      "name": "Mediobanca International (Luxembourg) S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "8224e4c3a019de13f40b87480a5effe632d9cc967ccf57af424c14bfe5e8a460",
    "signature": "1607836d63a2a3290a34b6e00ddb263b79bac2155c6b8080dfae4dc8a8e3f5d3",
    "prophecy_id": "8224e4c3a019"
  },
  {
    "rank": 43,
    "candidate": {
      "name": "Raiffeisen Bank International AG",
      "jurisdiction": "AT",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "a27ade87ae01ee93d848ad1cdef8553ee7ac73445a6b97a1641fa4fdc95228e5",
    "signature": "46a284bb8d894ac4b4a4b981d40d22bf30446f1e783f42385f4d03638a682957",
    "prophecy_id": "a27ade87ae01"
  },
  {
    "rank": 44,
    "candidate": {
      "name": "Erste Group Bank AG",
      "jurisdiction": "AT",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "1195105f8c465ed2ff13a0ab7c1b0cc41f6c8e99db07235f98a63af26f2e0076",
    "signature": "01ba6ad940ab7e3e9cccc7c5c6fa2ca41d8ec4353d32ea618129146da8500433",
    "prophecy_id": "1195105f8c46"
  },
  {
    "rank": 45,
    "candidate": {
      "name": "Bank of New York Mellon S.A./N.V. Luxembourg",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "9d5dd1d0fe4119768503531e38b266052ba33f1e4e7976dc78c751e1b86cf71f",
    "signature": "192a8b6fc5bc0562cd51dea42c862686dd3fb615ecf740b666d766d86d9fd904",
    "prophecy_id": "9d5dd1d0fe41"
  },
  {
    "rank": 46,
    "candidate": {
      "name": "State Street Bank Luxembourg S.C.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "1c8ad3005cd5112aef72e214e96db5d5a29778786f88193370f37ed7dc4e0ef5",
    "signature": "b6c06ed7a297b371e8e56990fa778bb4b91b3fb011ffb55ec4492da1529b5cde",
    "prophecy_id": "1c8ad3005cd5"
  },
  {
    "rank": 47,
    "candidate": {
      "name": "Allianz SE",
      "jurisdiction": "DE",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "31f6902e03f93ece61cc6d63ac04bc1a7d1f6553a7a994bd9ba3c4b6e2783ef5",
    "signature": "cac29424cc1d05537b870d3eafcd3cf74a29c195c8bbc6d278f50ed97c8fcd7d",
    "prophecy_id": "31f6902e03f9"
  },
  {
    "rank": 48,
    "candidate": {
      "name": "AXA S.A.",
      "jurisdiction": "FR",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "41101386316eed292d13ee9cee20285ddb10e27ca7ca9284c60f5f2b346f0d4b",
    "signature": "374df51c49f74ba6e3bbc0cbbafcde23ab824f44e0d74166935e70ea6a532885",
    "prophecy_id": "41101386316e"
  },
  {
    "rank": 49,
    "candidate": {
      "name": "Munich Re",
      "jurisdiction": "DE",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "f0f56193fa96e1455f4782fe692136b501eeeb9235944d27bec98b2eb416f9b5",
    "signature": "021f13c8d3fec2c5897650dc31c03f605591655c0c0bee4a711f48fd86e03151",
    "prophecy_id": "f0f56193fa96"
  },
  {
    "rank": 50,
    "candidate": {
      "name": "Swiss Re Europe S.A.",
      "jurisdiction": "LU",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "eb5d486dd812ea79e6fa105f8d13eaed33506eaed935f1c2c9e6aac4fffb7e72",
    "signature": "e53190f4d94499d53fae46565a517e8e453cc9873e564b0b72d200f35a8e9164",
    "prophecy_id": "eb5d486dd812"
  },
  {
    "rank": 51,
    "candidate": {
      "name": "Generali Insurance Asset Management",
      "jurisdiction": "IT",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "67cc6daf0546e4486c0e7ba8ce5db2c6f8bba858e0f092af17d1b738d3908992",
    "signature": "899faf6f0e1ab93bc6f8b97e055708eabfae20f270f55a4294d492d7b02746bc",
    "prophecy_id": "67cc6daf0546"
  },
  {
    "rank": 52,
    "candidate": {
      "name": "Zurich Insurance plc",
      "jurisdiction": "IE",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "9bd1737c240ebe542cd63fa1942fc42bc346a43338a0bf83d1ab2989a8c71d21",
    "signature": "a9e250859da256c2eb1106bfe4fa724f7b1457399540a4f24b3e2045cf1491d7",
    "prophecy_id": "9bd1737c240e"
  },
  {
    "rank": 53,
    "candidate": {
      "name": "NN Group N.V.",
      "jurisdiction": "NL",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "80c002633c0b49fad624b3d0e8a00b3e2d3838ca77bd909b2531a7ff1470b6fb",
    "signature": "147a8191d85f1c9af0b84029812afada10bbaa75012fa981dcac4c4067b4b43d",
    "prophecy_id": "80c002633c0b"
  },
  {
    "rank": 54,
    "candidate": {
      "name": "Aviva Investors Luxembourg",
      "jurisdiction": "LU",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "5003dd56fa968ba9f7fe46d7950543ecdea65baebe0c70833a58fcfe06d0593a",
    "signature": "a3a36e14adc2c3562a2b6fce7c3b7d19d9eb9e56ded4fb225b191c78b3e7340c",
    "prophecy_id": "5003dd56fa96"
  },
  {
    "rank": 55,
    "candidate": {
      "name": "Talanx International AG",
      "jurisdiction": "DE",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "04a63c2ef6cdc414fb1eade186842db15621860e399e9f74d9bd1a5e342a4bfd",
    "signature": "f3ae8e24041b99c617cb9035548b89d3665556cedd68d6e41cabc9c822b986c5",
    "prophecy_id": "04a63c2ef6cd"
  },
  {
    "rank": 56,
    "candidate": {
      "name": "Athora Holding Ltd.",
      "jurisdiction": "BM",
      "category": "insurance"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "f607633162e5d40d0f9b6e9778861b581eefff866ddbafe4b4c84b8eca8b9a70",
    "signature": "6afa431b4a697dabe7c435c6a14acf38afd4533571adf8db6fdec3af96f5fe35",
    "prophecy_id": "f607633162e5"
  },
  {
    "rank": 57,
    "candidate": {
      "name": "CVC Capital Partners SICAV-FIS S.A.",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "cbe5d2f8222ccb683dd444f10590c565c2e51663553e56afb878801cc0f6e3b4",
    "signature": "2962decb64c547771d7616a3ede03a968e855d97ddfb05f6ddfd790047e479fa",
    "prophecy_id": "cbe5d2f8222c"
  },
  {
    "rank": 58,
    "candidate": {
      "name": "EQT Partners (Luxembourg) S.à r.l.",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "63ec51c8f90a219ea69edceaaccab91906b65aec8da7f427b8fe7ab55e4d47c8",
    "signature": "85af44f3ba1a0f6eba328369633aaab5c0b4380010c9af6003b356218f0c1841",
    "prophecy_id": "63ec51c8f90a"
  },
  {
    "rank": 59,
    "candidate": {
      "name": "KKR Luxembourg Management S.à r.l.",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "9674c8bd913b7c574bb66ce7e3f2ed04103dd8f5d2e4eee4a212dd4ef42c82df",
    "signature": "d7f61e4f69c2c8f7585f72ca588aeca7c1cf959e789245b1e22c7e000a377c52",
    "prophecy_id": "9674c8bd913b"
  },
  {
    "rank": 60,
    "candidate": {
      "name": "Blackstone Group International Partners (Lux)",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "7c1bdf7ffdc2d88453de6c969f040cf05f90ca6f3df826f5bd698e451c4d5b30",
    "signature": "72eb6b3aec022821e3b1fac0161fe06cb04590b106f30a6e4a40c98c474d74a6",
    "prophecy_id": "7c1bdf7ffdc2"
  },
  {
    "rank": 61,
    "candidate": {
      "name": "Carlyle Investment Management Luxembourg",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "d2b338663cf09ce86ae5115704d063a3501a02deb0c1cd3adb0ea3f6f2a55ccc",
    "signature": "911cb22bf8c2b229a96b7ba3a5710387e67bcaf5fe0a06a0a79454489964ee54",
    "prophecy_id": "d2b338663cf0"
  },
  {
    "rank": 62,
    "candidate": {
      "name": "Bridgepoint Advisers Limited",
      "jurisdiction": "GB",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "0b08c3e0fa358435ca05794f460be6e19ac2ed10495b3600354aa0f494d50c60",
    "signature": "8704517baa6100691ca3d2b202737e56375b577c071e14499541482094d0dbd6",
    "prophecy_id": "0b08c3e0fa35"
  },
  {
    "rank": 63,
    "candidate": {
      "name": "Cinven Luxembourg S.à r.l.",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "b2618e6ee6452813439cba91f80ceb8a380b5a75b5189f7524d4a1523fe67cee",
    "signature": "d2b31f6889f2d25ebf605a314fa5b466406148188fe038953833f9358d362995",
    "prophecy_id": "b2618e6ee645"
  },
  {
    "rank": 64,
    "candidate": {
      "name": "PAI Partners SAS",
      "jurisdiction": "FR",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "ce22ddc8276d84889d44812af35566619619694dec85392d0b83b415baabb28b",
    "signature": "476e3300c951cb23334bf49cb6eff223b7723a1bf5209629e5ffb33c08f18529",
    "prophecy_id": "ce22ddc8276d"
  },
  {
    "rank": 65,
    "candidate": {
      "name": "Triton Investment Management Luxembourg",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "aeb389f7e0ae4fcdc46e01fd30c4f2fcac338e3bb3f76bdf0cd61cf00447a7ea",
    "signature": "8900a0e59c76f932f201b68e78255e404b6183cb5c3fac61cea5673f459a482d",
    "prophecy_id": "aeb389f7e0ae"
  },
  {
    "rank": 66,
    "candidate": {
      "name": "IK Investment Partners",
      "jurisdiction": "LU",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "9cad945f4993ae3e6d489987b60bbef941f7cade4223eb4e73731f0308f9d831",
    "signature": "d2af437d69734f6b9b446c63179cf4ba94881acdfe5bf08de08ab7fda2e5ff50",
    "prophecy_id": "9cad945f4993"
  },
  {
    "rank": 67,
    "candidate": {
      "name": "Apollo Management International LLP (London)",
      "jurisdiction": "GB",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "d2a2fcd865a552b9086fe2d0e51eff6cc0104be964a1047dfadf0cfab4ea273a",
    "signature": "8ecb62810bd15dddfa598245ee1231a0f06abb831ef7ec9cfbe725e8910c6e15",
    "prophecy_id": "d2a2fcd865a5"
  },
  {
    "rank": 68,
    "candidate": {
      "name": "Ardian Investment Switzerland",
      "jurisdiction": "CH",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "4d3aae45793cb37927377bea02a94a0060cfaec31a1961b6705ae5db60158a5d",
    "signature": "c0283e7ab409969e623fddf594597efbeceed84f50d4fdb4c0db39d695095b65",
    "prophecy_id": "4d3aae45793c"
  },
  {
    "rank": 69,
    "candidate": {
      "name": "Antin Infrastructure Partners",
      "jurisdiction": "FR",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "96b6462415689780a0eb31d1938f657312fb363fc2d314419019d519cdbaa108",
    "signature": "ca048a3ea07fc6bf9d07db636ae23491642d10b08e748412769bf260da3b14ee",
    "prophecy_id": "96b646241568"
  },
  {
    "rank": 70,
    "candidate": {
      "name": "Vauban Infrastructure Partners",
      "jurisdiction": "FR",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "c1bbcfd1054d208ed9c8c332346c84fb8495d69c7eeab1d81707c56a3bd37d90",
    "signature": "b6f9d592d841566efd9b5e8bf18be03e00c864ef1323acf4220bc43442e3a23f",
    "prophecy_id": "c1bbcfd1054d"
  },
  {
    "rank": 71,
    "candidate": {
      "name": "Meridiam SAS",
      "jurisdiction": "FR",
      "category": "private_equity"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "d38ed23c3de612c7b8d6fab040d781c51370f33e6d057c0ee4e3e30f93cb76f1",
    "signature": "9283387b5de32c0c03f625c3af6aa5edb4414a1be7330e8473efadbad0d95e6b",
    "prophecy_id": "d38ed23c3de6"
  },
  {
    "rank": 72,
    "candidate": {
      "name": "PATRIZIA Real Estate Investment Management Luxembourg",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "5781069e712baca2a9359b4094dc73d4f7afb784e3140951877e55bb8e31cde3",
    "signature": "bef11ba3f95d87b2d1cea4e184922b04142e001c45f1aa6132cb83dc375f25e4",
    "prophecy_id": "5781069e712b"
  },
  {
    "rank": 73,
    "candidate": {
      "name": "Hines European Real Estate Partners (Lux)",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "692647c7d71a274605b2d4de29bc7879c5adc3c8d59947e1554c232f8b0918c2",
    "signature": "546086ab75e10d0162778ad9fefb599f65b06409d88fa6f90aa8213fa86fa1a8",
    "prophecy_id": "692647c7d71a"
  },
  {
    "rank": 74,
    "candidate": {
      "name": "CBRE Investment Management (Luxembourg) S.A.",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "97cb1e8b2113278216974f3b30ef4aa2e039032a1616988bc46c84f96c448b43",
    "signature": "72f11467235c18cfb0e2bc8fad84ac6c37cb3d2a491019a2776aa08ff63ab9e5",
    "prophecy_id": "97cb1e8b2113"
  },
  {
    "rank": 75,
    "candidate": {
      "name": "AXA Investment Managers - Real Assets",
      "jurisdiction": "FR",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "c356cdda28319c1ae233e98217cf5db123b89865a04844cb1d9102c539bda41a",
    "signature": "445d15cc35f2908fc0dff1e534c856f8c274210ab09e63747bd183303e65f13d",
    "prophecy_id": "c356cdda2831"
  },
  {
    "rank": 76,
    "candidate": {
      "name": "Prologis European Logistics Fund",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "f25a382ccd70cb9428b6d726fc5242c93f4fd355483d0d04d7bc581c36cf3997",
    "signature": "f1735bc85e4fbc0b4a42947f41ed5ed159d1c3472758d65dcb131a7edfe32c9e",
    "prophecy_id": "f25a382ccd70"
  },
  {
    "rank": 77,
    "candidate": {
      "name": "Schroder Real Estate Investment Management (Lux)",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "8ce4e8f19caf58578524787f3d72fa2270b11c24ab0449bbcd02414891b4ca79",
    "signature": "7e2b1bcfff59bd3c58ca6cea2846ec16a7908eabfb9f6ebf8d7afad46d2af5ec",
    "prophecy_id": "8ce4e8f19caf"
  },
  {
    "rank": 78,
    "candidate": {
      "name": "Macquarie Infrastructure (Lux) S.à r.l.",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "cfc15278e28414f60b16ba0a8273414e3fce9ebd49429aff24cfac244b7a2c97",
    "signature": "14aceb27b7cdfefccfa15b3e3e05239d8aece0e68d2a67c252f6323f0e04460b",
    "prophecy_id": "cfc15278e284"
  },
  {
    "rank": 79,
    "candidate": {
      "name": "Aberdeen European Property Fund (Lux)",
      "jurisdiction": "LU",
      "category": "real_estate"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "6601d4a806c63ab4b52446f5f7b7e2fa5921128b1d3c1b965aeb61810c7383a0",
    "signature": "648e1f5f64a057d2552e85f828729cda9b98e958cc2ce20bd56c998ccee0fbe5",
    "prophecy_id": "6601d4a806c6"
  },
  {
    "rank": 80,
    "candidate": {
      "name": "Pictet & Cie (Europe) S.A.",
      "lei": "222100FT5B9H8W7QAQ64",
      "jurisdiction": "LU",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "d976d2fe38b5d1e61b92d0be8b229525407d51c7642abd41d97ede0758f0baa0",
    "signature": "b813ddae0495e9ceaf767b8e069cfb44e3d4e2afdc59320d38ece3ac96e25fe9",
    "prophecy_id": "d976d2fe38b5"
  },
  {
    "rank": 81,
    "candidate": {
      "name": "Lombard Odier (Europe) S.A.",
      "jurisdiction": "LU",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "3fb1f9548d427942429f60c985a8ced0e0ab6b38fa89fc4de48c45e52885a730",
    "signature": "bff43b39ef22305b406acff73532a600e08c0f59fbf1fb578760c023d7617fd7",
    "prophecy_id": "3fb1f9548d42"
  },
  {
    "rank": 82,
    "candidate": {
      "name": "Union Bancaire Privée (Europe) S.A.",
      "jurisdiction": "LU",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "c48fd5d0b334bc66ecdffdabe5a6c0e85f2abdb2632b680367e4b9a070352e6f",
    "signature": "60e4e68a602acaf25a0fc86af391f49948e3130f6de1ab7fcebfd45f6f7f1790",
    "prophecy_id": "c48fd5d0b334"
  },
  {
    "rank": 83,
    "candidate": {
      "name": "Bordier & Cie (Switzerland) Luxembourg branch",
      "jurisdiction": "LU",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "6962a8d8cf32618077388c2a3c4bceef48b8a3c004b7048ad46ce5923a08cace",
    "signature": "bd1135167ddea98b642f13e4d9e7c74517a6571c6a352937609e414de8389f99",
    "prophecy_id": "6962a8d8cf32"
  },
  {
    "rank": 84,
    "candidate": {
      "name": "JOH. BERENBERG, GOSSLER & CO. KG",
      "jurisdiction": "DE",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "017781a9835afcf28d4510697d91c17fc02f70c693c10cc7d97dd64f92608755",
    "signature": "6c42dcecf49e765ee9b5c8c25d5ada58cd8154d71412f40db6a75d459f9b4a31",
    "prophecy_id": "017781a9835a"
  },
  {
    "rank": 85,
    "candidate": {
      "name": "Hauck Aufhäuser Lampe Privatbank AG",
      "jurisdiction": "DE",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "f1e231357e0ccd0801224a98b0336199a06de3e8b308f79f0f03bac4b748a1ab",
    "signature": "da136e3f31d34d2aba6b870e2c272f93f84c70c1a6f395a45099b2d6aa6ffa64",
    "prophecy_id": "f1e231357e0c"
  },
  {
    "rank": 86,
    "candidate": {
      "name": "M.M.Warburg & CO",
      "jurisdiction": "DE",
      "category": "wealth"
    },
    "pre_crime_index": 30,
    "genesis_score": 65,
    "trajectory": "HOLDING",
    "forecast": "Scoring engine unavailable; placeholder issued.",
    "merkle_root": "71678b7312c8ca09f974e960874dfd410138e254bb90e2c3007b0aaa233b6da1",
    "signature": "af09b3bd0beeaa559fdcc4927f5506e67ddd42ff011d79a7a53e0f18ca253561",
    "prophecy_id": "71678b7312c8"
  },
  {
    "rank": 87,
    "candidate": {
      "name": "Allianz Life Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 28,
    "genesis_score": 72,
    "trajectory": "HOLDING",
    "forecast": "Operational-risk indicators suggest a need for continued vigilance regarding regulatory compliance.",
    "merkle_root": "5b4fea2b34c6cee52490be87f94e0cccd87581355b0ef32031a8208a31331b1a",
    "signature": "814240de122089d09340a1cb53cfe6a79c68f94b55bb8ce5a43c3a7c5ba11f9c",
    "prophecy_id": "5b4fea2b34c6"
  },
  {
    "rank": 88,
    "candidate": {
      "name": "BlackRock Investment Management (UK) Limited",
      "lei": "529900VBK42Y5HHRMD23",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 25,
    "genesis_score": 80,
    "trajectory": "HOLDING",
    "forecast": "BlackRock Investment Management (UK) Limited's operational-risk indicators are relatively low, but supervisory monitoring may be warranted to address potential governance gaps in its complex global structure.",
    "merkle_root": "0a11f19a64ebb3f748bd232a0c5dbe873b2d4c078e4ba4a718693dd4db3e5cac",
    "signature": "ad0e0473dd57dc551feb80ec15a65cc65b2a2491181b6ec2dcad6b1e71d88101",
    "prophecy_id": "0a11f19a64eb"
  },
  {
    "rank": 89,
    "candidate": {
      "name": "UBS Asset Management (Europe) S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 25,
    "genesis_score": 80,
    "trajectory": "RISING",
    "forecast": "UBS Asset Management (Europe) S.A.'s operational-risk indicators are relatively low, and its strong governance framework may continue to support its low-risk profile.",
    "merkle_root": "bbcbec1a755bf2bd4620e5978572ee94edb7976a4027cedd31d4f8287f09ef04",
    "signature": "f206fe615042713810ffa84a8081cf6bd03f0a803f4f6d4a2138e54992d80d40",
    "prophecy_id": "bbcbec1a755b"
  },
  {
    "rank": 90,
    "candidate": {
      "name": "abrdn Investments Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 25,
    "genesis_score": 80,
    "trajectory": "RISING",
    "forecast": "abrdn Investments Luxembourg S.A.'s operational-risk indicators are relatively low, and its strong governance framework may continue to support its low-risk profile.",
    "merkle_root": "6057bbf238d557693c9acdf28739ce25ba01953aafeb09404f4189805fbf2147",
    "signature": "143da3ad5d46c708a461fed1123a7a209e514ff034e63d79ccbbbe0ce154efa1",
    "prophecy_id": "6057bbf238d5"
  },
  {
    "rank": 91,
    "candidate": {
      "name": "Edmond de Rothschild Asset Management",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 25,
    "genesis_score": 80,
    "trajectory": "RISING",
    "forecast": "Edmond de Rothschild Asset Management's operational-risk indicators are relatively low, and its strong governance framework may continue to support its low-risk profile.",
    "merkle_root": "9e585654edf20115de371f624871f84bcceb337ad981f0ab94edfc98dedee103",
    "signature": "e13d43d86f41db456149317601ef060e9a299412727c40cd9cb769149bea0e6c",
    "prophecy_id": "9e585654edf2"
  },
  {
    "rank": 92,
    "candidate": {
      "name": "Janus Henderson Investors UK",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 25,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Regulatory compliance posture appears robust, but ongoing monitoring is necessary to address emerging risks.",
    "merkle_root": "4065c1018d6ae7ed7c35c2123c7f62245051c6a2aad6b4aad6b2083a79473de8",
    "signature": "ca0264b74e19a7261c518dfeb67233b2c372fe8121e9dfff60607ec0f8d005c4",
    "prophecy_id": "4065c1018d6a"
  },
  {
    "rank": 93,
    "candidate": {
      "name": "Banque Havilland S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 25,
    "genesis_score": 75,
    "trajectory": "HOLDING",
    "forecast": "Regulatory compliance posture appears robust, but ongoing monitoring is necessary to address emerging risks.",
    "merkle_root": "2778da44d46764122721d4225d91cfc060ceaba0070100c15f7752efb34dd598",
    "signature": "0b3787e692eaaea80455acb2848c77766dabdee20387992cfbd703d64bb3a1fd",
    "prophecy_id": "2778da44d467"
  },
  {
    "rank": 94,
    "candidate": {
      "name": "Citibank Europe plc",
      "jurisdiction": "IE",
      "category": "bank"
    },
    "pre_crime_index": 22,
    "genesis_score": 78,
    "trajectory": "HOLDING",
    "forecast": "Regulatory compliance posture is robust, but ongoing monitoring is necessary to address emerging operational risks.",
    "merkle_root": "8db9f384116bf1aeacba4cd9e1cab9add2664980d637b1d414f8db5b7d9e20c4",
    "signature": "9dc3fbd091608011ae63cacd55a50f308795db5d2732a76c6ffc156e7afd1d68",
    "prophecy_id": "8db9f384116b"
  },
  {
    "rank": 95,
    "candidate": {
      "name": "Schroder Investment Management (Europe) S.A.",
      "jurisdiction": "LU",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 20,
    "genesis_score": 85,
    "trajectory": "RISING",
    "forecast": "Schroder Investment Management (Europe) S.A.'s operational-risk indicators are relatively low, and its strong governance framework may continue to support its low-risk profile.",
    "merkle_root": "974aade503adecc165e87a82c533bb2ea6ec04ed00e4489eadaa931d3c486974",
    "signature": "5aa34401e149e23b303bb18f6de8c6298beb6ccf14e949986546c5e8932abdd6",
    "prophecy_id": "974aade503ad"
  },
  {
    "rank": 96,
    "candidate": {
      "name": "Pictet Asset Management S.A.",
      "jurisdiction": "CH",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 20,
    "genesis_score": 85,
    "trajectory": "RISING",
    "forecast": "Pictet Asset Management S.A.'s operational-risk indicators are relatively low, and its strong focus on risk management and governance may continue to support its low-risk profile.",
    "merkle_root": "f2c7b1f2dfb129b81ed9038c3e03ae18701ef625556a316a5f1a66a8ce50fe11",
    "signature": "12c20945f3f66043a1a53d9ebd48117f79fb42df7f52894770da650caae0f93a",
    "prophecy_id": "f2c7b1f2dfb1"
  },
  {
    "rank": 97,
    "candidate": {
      "name": "Quilter Investors Limited",
      "jurisdiction": "GB",
      "category": "asset_mgmt"
    },
    "pre_crime_index": 20,
    "genesis_score": 80,
    "trajectory": "HOLDING",
    "forecast": "Strong regulatory compliance posture and robust risk management frameworks minimize operational risks.",
    "merkle_root": "07dc893eca4b6d448038c18e04b36b8cf62395d93b17cc23a244d9cd6bf4c815",
    "signature": "edb3916427c8d695c59d1f11621c86a12a47a559a7b25239c2709e95186c061c",
    "prophecy_id": "07dc893eca4b"
  },
  {
    "rank": 98,
    "candidate": {
      "name": "ING Luxembourg S.A.",
      "jurisdiction": "LU",
      "category": "bank"
    },
    "pre_crime_index": 20,
    "genesis_score": 80,
    "trajectory": "HOLDING",
    "forecast": "Strong regulatory compliance posture and robust risk management frameworks minimize operational risks.",
    "merkle_root": "e517b72bac28db7314837de126c6f0bb123179a359bafef56e0276e8caa0317b",
    "signature": "54ab91053634d48ea6c0159f0fb83a19861f44b866bbd1939121a031c0109da6",
    "prophecy_id": "e517b72bac28"
  },
  {
    "rank": 99,
    "candidate": {
      "name": "Goldman Sachs Bank Europe SE",
      "jurisdiction": "DE",
      "category": "bank"
    },
    "pre_crime_index": 18,
    "genesis_score": 82,
    "trajectory": "HOLDING",
    "forecast": "Operational-risk indicators are low, reflecting strong governance and risk management practices.",
    "merkle_root": "61aa95b45f4f668f6b0a454922a658322dcd820a7656a42e574d34afe9c575c2",
    "signature": "14077ce0c62cca06d24ddac7a73fb5e1b157e65cd62478059851f3c196860a7b",
    "prophecy_id": "61aa95b45f4f"
  },
  {
    "rank": 100,
    "candidate": {
      "name": "JPMorgan Chase Bank, N.A. (London Branch)",
      "lei": "7H6GLXDRUGQFU57RNE97",
      "jurisdiction": "GB",
      "category": "bank"
    },
    "pre_crime_index": 15,
    "genesis_score": 85,
    "trajectory": "HOLDING",
    "forecast": "Robust risk management frameworks and strong regulatory compliance minimize operational risks.",
    "merkle_root": "066fe0f3da908b694c3ac89f60b3d2979c8835ba390a59cf76e2edd7e52d0da1",
    "signature": "b668d5174a2df43abd2648b15637a9744c9833100de0f1ab16b8931b0bea9966",
    "prophecy_id": "066fe0f3da90"
  }
]
