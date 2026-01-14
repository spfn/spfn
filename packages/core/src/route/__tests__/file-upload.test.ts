/**
 * File Upload 테스트
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { Type } from '@sinclair/typebox';
import { route, defineRouter, registerRoutes, FileSchema, FileArraySchema, OptionalFileSchema } from '../index';
import { ErrorHandler } from '../../middleware/error-handler';

describe('File Upload', () =>
{
    describe('parseFormData', () =>
    {
        it('should handle single file upload', async () =>
        {
            // Route 정의
            const uploadFile = route.post('/upload')
                .input({
                    formData: Type.Object({
                        file: FileSchema(),
                        description: Type.Optional(Type.String()),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    const file = formData.file as File;

                    return {
                        filename: file.name,
                        size: file.size,
                        type: file.type,
                        description: formData.description,
                    };
                });

            const router = defineRouter({ uploadFile });

            // Hono 앱 생성
            const app = new Hono();
            registerRoutes(app, router);

            // FormData 생성
            const formData = new FormData();
            const fileContent = new Blob(['Hello, World!'], { type: 'text/plain' });
            formData.append('file', fileContent, 'test.txt');
            formData.append('description', 'Test file');

            // 요청
            const res = await app.request('/upload', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.filename).toBe('test.txt');
            expect(json.size).toBe(13); // "Hello, World!".length
            expect(json.type).toBe('text/plain');
            expect(json.description).toBe('Test file');
        });

        it('should handle multiple files with same key', async () =>
        {
            const uploadFiles = route.post('/upload-multiple')
                .input({
                    formData: Type.Object({
                        files: FileArraySchema(),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    const files = formData.files as File[];

                    return {
                        count: files.length,
                        names: files.map(f => f.name),
                    };
                });

            const router = defineRouter({ uploadFiles });
            const app = new Hono();
            registerRoutes(app, router);

            const formData = new FormData();
            formData.append('files', new Blob(['File 1'], { type: 'text/plain' }), 'file1.txt');
            formData.append('files', new Blob(['File 2'], { type: 'text/plain' }), 'file2.txt');
            formData.append('files', new Blob(['File 3'], { type: 'text/plain' }), 'file3.txt');

            const res = await app.request('/upload-multiple', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.count).toBe(3);
            expect(json.names).toEqual(['file1.txt', 'file2.txt', 'file3.txt']);
        });

        it('should handle mixed form fields and files', async () =>
        {
            const createPost = route.post('/posts')
                .input({
                    formData: Type.Object({
                        title: Type.String(),
                        content: Type.String(),
                        image: OptionalFileSchema(),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    const image = formData.image as File | undefined;

                    return {
                        title: formData.title,
                        content: formData.content,
                        hasImage: !!image,
                        imageName: image?.name,
                    };
                });

            const router = defineRouter({ createPost });
            const app = new Hono();
            registerRoutes(app, router);

            const formData = new FormData();
            formData.append('title', 'My Post');
            formData.append('content', 'Post content here');
            formData.append('image', new Blob(['image data'], { type: 'image/png' }), 'photo.png');

            const res = await app.request('/posts', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.title).toBe('My Post');
            expect(json.content).toBe('Post content here');
            expect(json.hasImage).toBe(true);
            expect(json.imageName).toBe('photo.png');
        });

        it('should still support JSON body', async () =>
        {
            const createUser = route.post('/users')
                .input({
                    body: Type.Object({
                        name: Type.String(),
                        email: Type.String(),
                    }),
                })
                .handler(async (c) =>
                {
                    const { body } = await c.data();
                    return { created: true, name: body.name, email: body.email };
                });

            const router = defineRouter({ createUser });
            const app = new Hono();
            registerRoutes(app, router);

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.created).toBe(true);
            expect(json.name).toBe('John');
            expect(json.email).toBe('john@example.com');
        });
    });

    describe('file validation', () =>
    {
        it('should reject files exceeding maxSize', async () =>
        {
            const uploadFile = route.post('/upload')
                .input({
                    formData: Type.Object({
                        file: FileSchema({
                            maxSize: 100,  // 100 bytes max
                        }),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    return { size: (formData.file as File).size };
                });

            const router = defineRouter({ uploadFile });
            const app = new Hono();
            app.onError(ErrorHandler());
            registerRoutes(app, router);

            const formData = new FormData();
            const largeContent = 'x'.repeat(200);  // 200 bytes - exceeds limit
            formData.append('file', new Blob([largeContent], { type: 'text/plain' }), 'large.txt');

            const res = await app.request('/upload', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(400);  // ValidationError statusCode is 400

            const json = await res.json();
            expect(json.message).toContain('Invalid');
            expect(json.fields[0].message).toContain('exceeds maximum');
        });

        it('should reject files with invalid MIME type', async () =>
        {
            const uploadImage = route.post('/upload-image')
                .input({
                    formData: Type.Object({
                        image: FileSchema({
                            allowedTypes: ['image/jpeg', 'image/png'],
                        }),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    return { type: (formData.image as File).type };
                });

            const router = defineRouter({ uploadImage });
            const app = new Hono();
            app.onError(ErrorHandler());
            registerRoutes(app, router);

            const formData = new FormData();
            formData.append('image', new Blob(['test'], { type: 'text/plain' }), 'file.txt');

            const res = await app.request('/upload-image', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(400);

            const json = await res.json();
            expect(json.fields[0].message).toContain('not allowed');
        });

        it('should reject too many files in array', async () =>
        {
            const uploadFiles = route.post('/upload-files')
                .input({
                    formData: Type.Object({
                        files: FileArraySchema({
                            maxFiles: 2,
                        }),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    return { count: (formData.files as File[]).length };
                });

            const router = defineRouter({ uploadFiles });
            const app = new Hono();
            app.onError(ErrorHandler());
            registerRoutes(app, router);

            const formData = new FormData();
            formData.append('files', new Blob(['1'], { type: 'text/plain' }), 'file1.txt');
            formData.append('files', new Blob(['2'], { type: 'text/plain' }), 'file2.txt');
            formData.append('files', new Blob(['3'], { type: 'text/plain' }), 'file3.txt');

            const res = await app.request('/upload-files', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(400);

            const json = await res.json();
            expect(json.fields[0].message).toContain('Too many files');
        });

        it('should accept valid files', async () =>
        {
            const uploadImage = route.post('/upload-image')
                .input({
                    formData: Type.Object({
                        image: FileSchema({
                            maxSize: 1024 * 1024,  // 1MB
                            allowedTypes: ['image/jpeg', 'image/png'],
                        }),
                    }),
                })
                .handler(async (c) =>
                {
                    const { formData } = await c.data();
                    const file = formData.image as File;
                    return { name: file.name, type: file.type, size: file.size };
                });

            const router = defineRouter({ uploadImage });
            const app = new Hono();
            registerRoutes(app, router);

            const formData = new FormData();
            formData.append('image', new Blob(['valid image data'], { type: 'image/png' }), 'test.png');

            const res = await app.request('/upload-image', {
                method: 'POST',
                body: formData,
            });

            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.name).toBe('test.png');
            expect(json.type).toBe('image/png');
        });
    });
});
