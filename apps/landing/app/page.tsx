export default function HomePage()
{
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="text-center">
                <h1 className="text-6xl font-bold text-gray-900 mb-4">
                    SPFN
                </h1>
                <p className="text-2xl text-gray-700 mb-8">
                    The Missing Backend for Next.js
                </p>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                    TypeScript 풀스택 프레임워크<br />
                    Rails의 생산성 + Spring Boot의 견고함
                </p>
                <div className="mt-12 space-x-4">
                    <a
                        href="https://github.com/spfn"
                        className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
                    >
                        GitHub
                    </a>
                    <a
                        href="/docs"
                        className="inline-block px-6 py-3 bg-white text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                    >
                        Documentation
                    </a>
                </div>
            </div>
        </div>
    );
}