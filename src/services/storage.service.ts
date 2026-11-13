import { getSupabaseClient } from '@/lib/supabase';
import { toFriendlyError } from './errors';

export type DrVetStorageBucket =
  | 'exam-reports'
  | 'clinical-attachments'
  | 'pet-avatars';

export interface UploadStorageFileInput {
  bucket: DrVetStorageBucket;
  path: string;
  file: File;
  upsert?: boolean;
}

export interface StorageFileEntry {
  name: string;
  fullPath: string;
  size: number | null;
  createdAt: string | null;
}

const BUCKET_RULES: Record<
  DrVetStorageBucket,
  { maxBytes: number; maxLabel: string; mimeTypes: string[]; formatsLabel: string }
> = {
  'exam-reports': {
    maxBytes: 10 * 1024 * 1024,
    maxLabel: '10 MB',
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    formatsLabel: 'PDF, JPG, PNG ou WEBP',
  },
  'clinical-attachments': {
    maxBytes: 10 * 1024 * 1024,
    maxLabel: '10 MB',
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    formatsLabel: 'PDF, JPG, PNG ou WEBP',
  },
  'pet-avatars': {
    maxBytes: 5 * 1024 * 1024,
    maxLabel: '5 MB',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    formatsLabel: 'JPG, PNG ou WEBP',
  },
};

export function validarArquivoStorage(bucket: DrVetStorageBucket, file: File) {
  const rule = BUCKET_RULES[bucket];
  if (file.size <= 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }
  if (file.size > rule.maxBytes) {
    throw new Error(`O arquivo excede o limite de ${rule.maxLabel}.`);
  }
  if (!rule.mimeTypes.includes(file.type)) {
    throw new Error(`Formato não suportado. Utilize ${rule.formatsLabel}.`);
  }
}

export function gerarCaminhoSeguroStorage(folderPath: string, fileName: string) {
  const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
  const safeName = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
  const stamp = Date.now();
  return `${cleanFolder}/${stamp}-${safeName || 'arquivo'}`;
}

export async function uploadArquivoStorage(
  input: UploadStorageFileInput,
): Promise<{ path: string }> {
  try {
    validarArquivoStorage(input.bucket, input.file);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(input.bucket)
      .upload(input.path, input.file, {
        cacheControl: '3600',
        upsert: input.upsert ?? false,
        contentType: input.file.type || undefined,
      });

    if (error) throw error;
    return { path: data.path };
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível enviar o arquivo.');
  }
}

export async function obterUrlAssinadaStorage(
  bucket: DrVetStorageBucket,
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw error ?? new Error('URL assinada indisponível.');
    }
    return data.signedUrl;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível gerar o link seguro do arquivo.');
  }
}

export async function listarArquivosStorage(
  bucket: DrVetStorageBucket,
  folderPath: string,
): Promise<StorageFileEntry[]> {
  try {
    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(cleanFolder, { sortBy: { column: 'created_at', order: 'desc' } });

    if (error) throw error;
    return (data ?? [])
      .filter((item) => item.name && !item.name.endsWith('/'))
      .map((item) => ({
        name: item.name,
        fullPath: `${cleanFolder}/${item.name}`,
        size:
          typeof item.metadata?.size === 'number' ? item.metadata.size : null,
        createdAt: item.created_at ?? null,
      }));
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível listar os arquivos.');
  }
}

export async function excluirArquivoStorage(
  bucket: DrVetStorageBucket,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  } catch (error) {
    throw toFriendlyError(error, 'Não foi possível excluir o arquivo.');
  }
}
