export type Document<T = Record<string, any>> = {
  pageContent: string;
  metadata: T;
};
