// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Document<T = Record<string, any>> = {
  pageContent: string;
  metadata: T;
};
