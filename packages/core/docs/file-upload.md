# File Upload

Complete guide for handling file uploads in SPFN applications.

## Basic Usage

### Single File Upload

```typescript
import { route, FileSchema } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const uploadAvatar = route.post('/users/:id/avatar')
    .input({
        params: Type.Object({ id: Type.String() }),
        formData: Type.Object({
            file: FileSchema(),
            description: Type.Optional(Type.String())
        })
    })
    .handler(async (c) =>
    {
        const { params, formData } = await c.data();
        const file = formData.file as File;

        // File properties
        console.log(file.name);  // original filename
        console.log(file.size);  // size in bytes
        console.log(file.type);  // MIME type

        // Read file content
        const buffer = await file.arrayBuffer();
        const text = await file.text();  // for text files

        return c.created({ filename: file.name, size: file.size });
    });
```

### Multiple Files

```typescript
import { route, FileArraySchema } from '@spfn/core/route';

export const uploadDocuments = route.post('/documents')
    .input({
        formData: Type.Object({
            files: FileArraySchema(),
            category: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const files = formData.files as File[];

        const results = await Promise.all(
            files.map(async (file) =>
            {
                const buffer = await file.arrayBuffer();
                // Process each file...
                return { name: file.name, size: file.size };
            })
        );

        return { uploaded: results.length, files: results };
    });
```

### Mixed Fields

```typescript
export const createPost = route.post('/posts')
    .input({
        formData: Type.Object({
            title: Type.String(),
            content: Type.String(),
            image: OptionalFileSchema(),
            tags: Type.Optional(Type.String())  // JSON string
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const image = formData.image as File | undefined;

        const post = await postRepo.create({
            title: formData.title,
            content: formData.content,
            tags: formData.tags ? JSON.parse(formData.tags) : [],
            imageUrl: image ? await saveFile(image) : null
        });

        return c.created(post);
    });
```

---

## Validation

### Declarative Validation (Recommended)

Use schema options for automatic validation:

```typescript
import { route, FileSchema, FileArraySchema } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

// Single file with size and type constraints
export const uploadAvatar = route.post('/avatars')
    .input({
        formData: Type.Object({
            avatar: FileSchema({
                maxSize: 5 * 1024 * 1024,  // 5MB
                allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
            })
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.avatar as File;
        // File is already validated - safe to use
        return { name: file.name, size: file.size };
    });

// Multiple files with count and size limits
export const uploadDocuments = route.post('/documents')
    .input({
        formData: Type.Object({
            files: FileArraySchema({
                maxFiles: 5,
                minFiles: 1,
                maxSize: 10 * 1024 * 1024,  // 10MB per file
                allowedTypes: ['application/pdf', 'application/msword']
            })
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const files = formData.files as File[];
        return { count: files.length };
    });
```

**Available Options:**

| Option | Type | Description |
|--------|------|-------------|
| `maxSize` | number | Maximum file size in bytes |
| `minSize` | number | Minimum file size in bytes |
| `allowedTypes` | string[] | Allowed MIME types |
| `maxFiles` | number | Maximum file count (FileArraySchema only) |
| `minFiles` | number | Minimum file count (FileArraySchema only) |

Validation errors are thrown automatically with 400 status code and structured error response:

```json
{
    "message": "Invalid form data",
    "fields": [
        {
            "path": "/avatar",
            "message": "File size 15.0MB exceeds maximum 5.0MB",
            "value": 15728640
        }
    ]
}
```

---

### Manual Validation (Advanced)

For custom validation logic, validate in the handler:

```typescript
import { ValidationError } from '@spfn/core/errors';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const uploadImage = route.post('/images')
    .input({
        formData: Type.Object({
            image: FileSchema()
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.image as File;

        // Custom validation logic
        if (!ALLOWED_IMAGE_TYPES.includes(file.type))
        {
            throw new ValidationError({
                message: 'Invalid file type',
                fields: [{
                    path: '/image',
                    message: `Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
                    value: file.type
                }]
            });
        }

        // Process valid image...
    });
```

### File Size Validation

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB

export const uploadFile = route.post('/files')
    .input({
        formData: Type.Object({
            file: FileSchema()
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.file as File;

        if (file.size > MAX_FILE_SIZE)
        {
            throw new ValidationError({
                message: 'File too large',
                fields: [{
                    path: '/file',
                    message: `Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
                    value: file.size
                }]
            });
        }

        // Process file...
    });
```

### Reusable Validation Helper

```typescript
// lib/file-validation.ts
import { ValidationError } from '@spfn/core/errors';

interface FileValidationOptions
{
    maxSize?: number;
    allowedTypes?: string[];
    required?: boolean;
}

export function validateFile(
    file: File | undefined,
    fieldName: string,
    options: FileValidationOptions = {}
): void
{
    const { maxSize, allowedTypes, required = true } = options;

    if (!file)
    {
        if (required)
        {
            throw new ValidationError({
                message: 'File required',
                fields: [{ path: `/${fieldName}`, message: 'File is required', value: null }]
            });
        }
        return;
    }

    if (maxSize && file.size > maxSize)
    {
        throw new ValidationError({
            message: 'File too large',
            fields: [{
                path: `/${fieldName}`,
                message: `Maximum size: ${(maxSize / 1024 / 1024).toFixed(1)}MB`,
                value: file.size
            }]
        });
    }

    if (allowedTypes && !allowedTypes.includes(file.type))
    {
        throw new ValidationError({
            message: 'Invalid file type',
            fields: [{
                path: `/${fieldName}`,
                message: `Allowed types: ${allowedTypes.join(', ')}`,
                value: file.type
            }]
        });
    }
}

// Usage
export const uploadImage = route.post('/images')
    .input({ formData: Type.Object({ image: FileSchema() }) })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.image as File;

        validateFile(file, 'image', {
            maxSize: 5 * 1024 * 1024,
            allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
        });

        // File is valid...
    });
```

---

## Storage Patterns

### Local File System

```typescript
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = './uploads';

async function saveToLocal(file: File, subdir: string = ''): Promise<string>
{
    const dir = join(UPLOAD_DIR, subdir);
    await mkdir(dir, { recursive: true });

    const ext = file.name.split('.').pop() || '';
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(dir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    return filepath;
}

export const uploadFile = route.post('/files')
    .input({ formData: Type.Object({ file: FileSchema() }) })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.file as File;

        const path = await saveToLocal(file, 'documents');

        return c.created({ path, originalName: file.name });
    });
```

### AWS S3

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET!;

async function uploadToS3(file: File, prefix: string = ''): Promise<string>
{
    const ext = file.name.split('.').pop() || '';
    const key = `${prefix}${randomUUID()}.${ext}`;

    await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        Metadata: {
            originalName: file.name
        }
    }));

    return `https://${BUCKET}.s3.amazonaws.com/${key}`;
}

export const uploadAvatar = route.post('/avatars')
    .input({
        formData: Type.Object({
            image: FileSchema({
                maxSize: 2 * 1024 * 1024,
                allowedTypes: ['image/jpeg', 'image/png']
            })
        })
    })
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.image as File;
        // File already validated via schema

        const url = await uploadToS3(file, 'avatars/');

        return c.created({ url });
    });
```

### Cloudflare R2

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    }
});

async function uploadToR2(file: File, prefix: string = ''): Promise<string>
{
    const key = `${prefix}${randomUUID()}.${file.name.split('.').pop()}`;

    await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type
    }));

    return `${process.env.R2_PUBLIC_URL}/${key}`;
}
```

---

## Streaming (Large Files)

For large files, use streaming to avoid memory issues:

```typescript
import { Readable } from 'stream';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export const uploadLargeFile = route.post('/large-files')
    .handler(async (c) =>
    {
        // Access raw request for streaming
        const formData = await c.raw.req.formData();
        const file = formData.get('file') as File;

        if (!file)
        {
            throw new ValidationError({ message: 'File required' });
        }

        // Stream to disk
        const outputPath = `./uploads/${randomUUID()}.bin`;
        const writeStream = createWriteStream(outputPath);

        // Convert File to Node.js Readable stream
        const reader = file.stream().getReader();
        const nodeStream = new Readable({
            async read()
            {
                const { done, value } = await reader.read();
                if (done)
                {
                    this.push(null);
                }
                else
                {
                    this.push(Buffer.from(value));
                }
            }
        });

        await pipeline(nodeStream, writeStream);

        return c.created({ path: outputPath, size: file.size });
    });
```

---

## Security Best Practices

### 1. Always Validate MIME Types

```typescript
// Don't trust the file extension - check MIME type
const file = formData.file as File;

// Also consider using magic bytes for true type detection
import { fileTypeFromBuffer } from 'file-type';

const buffer = Buffer.from(await file.arrayBuffer());
const detected = await fileTypeFromBuffer(buffer);

if (!detected || !ALLOWED_TYPES.includes(detected.mime))
{
    throw new ValidationError({ message: 'Invalid file type' });
}
```

### 2. Generate New Filenames

```typescript
// Never use user-provided filenames directly
const userFilename = file.name;  // potentially malicious

// Generate safe filename
const safeFilename = `${randomUUID()}.${getExtension(file.type)}`;

function getExtension(mimeType: string): string
{
    const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf'
    };
    return map[mimeType] || 'bin';
}
```

### 3. Limit File Size at Server Level

```typescript
// server.config.ts
export default defineServerConfig()
    .lifecycle({
        beforeRoutes: async (app) =>
        {
            // Global body size limit (Hono middleware)
            app.use('*', async (c, next) =>
            {
                const contentLength = parseInt(c.req.header('content-length') || '0');
                const MAX_BODY_SIZE = 50 * 1024 * 1024;  // 50MB

                if (contentLength > MAX_BODY_SIZE)
                {
                    return c.json({ error: 'Request too large' }, 413);
                }

                await next();
            });
        }
    })
    .build();
```

### 4. Store Outside Web Root

```typescript
// Files should not be directly accessible via URL
const UPLOAD_DIR = '/var/data/uploads';  // Outside public/

// Serve files through authenticated route
export const getFile = route.get('/files/:id')
    .use([authMiddleware])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const file = await fileRepo.findById(params.id);

        if (!file || !canAccess(c.raw.get('user'), file))
        {
            throw new NotFoundError();
        }

        // Stream file from secure location
        const buffer = await readFile(file.path);
        return new Response(buffer, {
            headers: {
                'Content-Type': file.mimeType,
                'Content-Disposition': `attachment; filename="${file.originalName}"`
            }
        });
    });
```

### 5. Scan for Malware (Production)

```typescript
import { ClamScan } from 'clamscan';

const clam = new ClamScan({ clamdscan: { host: 'localhost', port: 3310 } });

async function scanFile(buffer: Buffer): Promise<boolean>
{
    const { isInfected } = await clam.scanBuffer(buffer);
    return !isInfected;
}

export const uploadFile = route.post('/files')
    .handler(async (c) =>
    {
        const { formData } = await c.data();
        const file = formData.file as File;
        const buffer = Buffer.from(await file.arrayBuffer());

        const isSafe = await scanFile(buffer);
        if (!isSafe)
        {
            throw new ValidationError({ message: 'File rejected by security scan' });
        }

        // Proceed with safe file...
    });
```

---

## Client Usage

### SPFN API Client (Recommended)

Type-safe file upload with full type inference:

```typescript
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

const api = createApi<AppRouter>();

// Single file upload
const result = await api.uploadAvatar.call({
    params: { id: '123' },
    formData: {
        file: fileInput.files[0],      // File object - type-safe!
        description: 'Profile photo'    // string field
    }
});

// Multiple files
const docs = await api.uploadDocuments.call({
    formData: {
        files: Array.from(fileInput.files),  // File[]
        category: 'reports'
    }
});

// With additional options
const result = await api.uploadFile
    .headers({ 'X-Custom': 'value' })
    .call({
        formData: { file: myFile }
    });
```

**How it works:**
1. Client builds `FormData` with files and metadata
2. RPC Proxy parses multipart and forwards to backend
3. Backend route receives typed `formData` via `c.data()`

### Fetch API

For direct backend calls (bypassing RPC proxy):

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'My file');

const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
    // Note: Don't set Content-Type header - browser sets it with boundary
});
```

### curl

```bash
# Single file
curl -X POST http://localhost:3000/upload \
  -F "file=@./document.pdf" \
  -F "description=Important document"

# Multiple files
curl -X POST http://localhost:3000/upload-multiple \
  -F "files=@./file1.txt" \
  -F "files=@./file2.txt"
```

---

## Summary

| Schema | Description |
|--------|-------------|
| `FileSchema()` | Single File object |
| `FileSchema(options)` | Single File with validation |
| `FileArraySchema()` | Array of File objects |
| `FileArraySchema(options)` | Array of Files with validation |
| `OptionalFileSchema()` | Optional single File |
| `OptionalFileSchema(options)` | Optional File with validation |

| Validation Option | Type | Description |
|-------------------|------|-------------|
| `maxSize` | number | Maximum file size in bytes |
| `minSize` | number | Minimum file size in bytes |
| `allowedTypes` | string[] | Allowed MIME types |
| `maxFiles` | number | Maximum file count (FileArraySchema only) |
| `minFiles` | number | Minimum file count (FileArraySchema only) |

| File Property | Type | Description |
|---------------|------|-------------|
| `file.name` | string | Original filename |
| `file.size` | number | Size in bytes |
| `file.type` | string | MIME type |
| `file.arrayBuffer()` | Promise\<ArrayBuffer\> | File content as buffer |
| `file.text()` | Promise\<string\> | File content as text |
| `file.stream()` | ReadableStream | File as stream |
