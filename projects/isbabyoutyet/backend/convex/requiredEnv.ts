export function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} environment variable is not set`);
  }
  return value;
}
