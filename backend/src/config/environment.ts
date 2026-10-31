import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See backend/.env.example.`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  email: {
    host: process.env.EMAIL_HOST ?? '',
    port: Number(process.env.EMAIL_PORT ?? 587),
    user: process.env.EMAIL_USER ?? '',
    password: process.env.EMAIL_PASSWORD ?? '',
    from: process.env.EMAIL_FROM ?? 'Brightloop <no-reply@brightloop.in>',
  },
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  schedulerEnabled: (process.env.ENABLE_SCHEDULER ?? 'true') !== 'false',
};
