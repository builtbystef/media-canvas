declare module "papaparse" {
  export function parse(input: string, config?: { header?: boolean }): { data: unknown[] };
  const Papa: { parse: typeof parse };
  export default Papa;
}
