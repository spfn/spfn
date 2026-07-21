export class PagesError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'PagesError';
    }
}

export class SiteConfigError extends PagesError
{
    constructor(message: string)
    {
        super(message);
        this.name = 'SiteConfigError';
    }
}

export class FrontmatterError extends PagesError
{
    constructor(message: string)
    {
        super(message);
        this.name = 'FrontmatterError';
    }
}
