import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const part = request.nextUrl.searchParams.get('part');
  const download = request.nextUrl.searchParams.get('download') === '1';

  const filename =
    part === 'seed' ? 'seed.sql' : 'install_all_11_migrations.sql';
  const targetPath = path.join(process.cwd(), 'supabase', filename);

  try {
    const content = await readFile(targetPath, 'utf8');
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }
    return new NextResponse(content, { status: 200, headers });
  } catch {
    return NextResponse.json(
      { error: `Arquivo supabase/${filename} não encontrado.` },
      { status: 404 },
    );
  }
}
