interface ToHTMLOptions {
  timeout?: number;
  disableSandbox?: boolean;
  disableGPU?: boolean;
  devtools?: boolean;
  useLocal?: boolean;
  onError?: (error: any) => void;
  onProgress?: (msg: string, remaining: number) => void;
  onWarning?: (warning: any) => void;
}

interface ToHTMLMessage {
  details?: string;
  elements?: any[];
  hint?: string;
  message: string;
  name: `ReSpec${"Error" | "Warning"}`;
  plugin: string;
  stack?: string;
  title?: string;
}

declare module "respec" {
  export function toHTML(
    url: string,
    options?: ToHTMLOptions,
  ): Promise<{
    html: string;
    errors: ToHTMLMessage[];
    warnings: ToHTMLMessage[];
  }>;
}
