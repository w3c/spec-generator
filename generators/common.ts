interface SpecGeneratorErrorConstructorOptions {
    message: string;
    status: number;
}

export class SpecGeneratorError extends Error {
    status: number;
    constructor(init: string | SpecGeneratorErrorConstructorOptions) {
        const { message, status } =
            typeof init === "string" ? { message: init, status: 500 } : init;
        super(message);
        this.status = status;
    }
}
