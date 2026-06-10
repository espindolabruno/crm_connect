import { NextRequest, NextResponse } from 'next/server';

async function handleProxy(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const rawApiUrl = process.env.API_URL || 'http://localhost:4000';
  const baseApiUrl = rawApiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');

  const { path } = await params;
  const resolvedPath = path ? path.join('/') : '';
  const searchParams = request.nextUrl.search;

  const destination = `${baseApiUrl}/api${resolvedPath ? `/${resolvedPath}` : ''}${searchParams}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const bodyText = await request.text();
        fetchOptions.body = bodyText;
      } else {
        fetchOptions.body = await request.arrayBuffer();
      }
    }

    const apiResponse = await fetch(destination, fetchOptions);

    const responseHeaders = new Headers(apiResponse.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(apiResponse.body, {
      status: apiResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`Error proxying request to ${destination}:`, error);
    return NextResponse.json(
      { error: `Failed to proxy to backend API: ${error.message}` },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export const PATCH = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
