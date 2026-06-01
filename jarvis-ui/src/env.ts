import { z } from 'zod'

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL').optional(),
})

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_SENTRY_DSN: z
    .string()
    .url('NEXT_PUBLIC_SENTRY_DSN must be a valid URL')
    .optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_POSTHOG_KEY cannot be empty if set')
    .optional(),
  NEXT_PUBLIC_API_URL: z
    .string()
    .url('NEXT_PUBLIC_API_URL must be a valid URL')
    .default('http://localhost:8000'),
})

const envSchema = serverSchema.merge(clientSchema)

type EnvInput = {
  NODE_ENV: string | undefined
  DATABASE_URL: string | undefined
  NEXT_PUBLIC_APP_URL: string | undefined
  NEXT_PUBLIC_SENTRY_DSN: string | undefined
  NEXT_PUBLIC_POSTHOG_KEY: string | undefined
  NEXT_PUBLIC_API_URL: string | undefined
}

function createEnv(): z.infer<typeof envSchema> {
  const raw: EnvInput = {
    NODE_ENV: process.env['NODE_ENV'],
    DATABASE_URL: process.env['DATABASE_URL'],
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'],
    NEXT_PUBLIC_SENTRY_DSN: process.env['NEXT_PUBLIC_SENTRY_DSN'],
    NEXT_PUBLIC_POSTHOG_KEY: process.env['NEXT_PUBLIC_POSTHOG_KEY'],
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
  }

  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const { fieldErrors } = result.error.flatten()
    const lines = Object.entries(fieldErrors)
      .map(([field, errors]) => `  ${field}: ${(errors ?? []).join(', ')}`)
      .join('\n')
    const message = '[env] Invalid environment variables:\n' + lines
    console.error(message)
    if (typeof process !== 'undefined' && typeof process.exit === 'function' && typeof window === 'undefined') {
      process.exit(1)
    }
    throw new Error(message)
  }

  return result.data
}

export const env = createEnv()
export type Env = z.infer<typeof envSchema>
