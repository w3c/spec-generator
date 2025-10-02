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

declare module "respec" {
    export function toHTML(
        url: string,
        options?: ToHTMLOptions,
    ): Promise<{
        html: string;
        errors: any[];
        warnings: any[];
    }>;
}
