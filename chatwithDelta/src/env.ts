import { z } from 'zod';

const envSchema = z.object({
  EMAIL_TARGET: z.string().email(),
  SYSTEM_NAME: z.string(),
  UIUC_API_KEY: z.string(),
  UIUC_COURSE_NAME: z.string(),
  MODEL_URL: z.string(),
});

// Set default environment variables if not already set
if (!process.env['UIUC_COURSE_NAME']) process.env['UIUC_COURSE_NAME'] = 'Delta-Documentation';
if (!process.env['SYSTEM_NAME']) process.env['SYSTEM_NAME'] = 'Delta';
if (!process.env['EMAIL_TARGET']) process.env['EMAIL_TARGET'] = 'divvyamnew@gmail.com';


// Log current environment variables
console.log('Current environment variables:');
console.log('EMAIL_TARGET:', process.env['EMAIL_TARGET']);
console.log('SYSTEM_NAME:', process.env['SYSTEM_NAME']);
console.log('UIUC_COURSE_NAME:', process.env['UIUC_COURSE_NAME']);
console.log('UIUC_API_KEY:', process.env['UIUC_API_KEY'] ? '***' : 'not set');
console.log('MODEL_URL:', process.env['MODEL_URL'] ? '***' : 'not set');

/**
 * Parsed environment variables.
 */

export const env = envSchema.parse(process.env);