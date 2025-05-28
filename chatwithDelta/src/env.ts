import { z } from 'zod';

const envSchema = z.object({
  EMAIL_TARGET: z.string().email(),
  SYSTEM_NAME: z.string(),
  UIUC_API_KEY: z.string(),
  UIUC_COURSE_NAME: z.string(),
});

// Default value if not set by env variable
process.env['SYSTEM_NAME'] = 'Delta';
process.env['UIUC_COURSE_NAME'] = 'Delta-Documentation';
process.env['EMAIL_TARGET'] = 'abode@illinois.edu';

/**
 * Parsed environment variables.
 */
export const env = envSchema.parse(process.env);