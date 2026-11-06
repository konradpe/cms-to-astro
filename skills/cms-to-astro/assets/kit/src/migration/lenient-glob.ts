import { glob, type Loader, type LoaderContext } from 'astro/loaders';

/**
 * `glob()` that never lets one bad file fail the build. Converted content is imperfect and may be
 * written while a build runs; Astro's glob aborts the whole build on broken YAML, schema errors or
 * a Markdown render error. Here each of those is a warning:
 *   - unreadable frontmatter or schema failure: the entry is kept as `draft: true` (not routed);
 *   - render error: the entry renders empty.
 * The schema (schema.ts) is lenient too, so in practice only YAML syntax errors get here.
 *
 * Relies on `entryTypes` in the loader context (Astro 5–7); if a future Astro drops it, only the
 * YAML/render fallbacks stop working, schema failures are still caught.
 */

type GlobOptions = Parameters<typeof glob>[0];

interface EntryType {
  getEntryInfo(params: { fileUrl: URL; contents: string }): Promise<{ data: Record<string, unknown>; body: string }> | { data: Record<string, unknown>; body: string };
  getRenderFunction?(config: unknown): Promise<(params: unknown) => Promise<unknown>>;
  [key: string]: unknown;
}

const BROKEN = { title: '', draft: true };
const firstLine = (error: unknown) => String((error as Error)?.message ?? error).split('\n')[0];

export function lenientGlob(options: GlobOptions): Loader {
  const inner = glob({
    // Ids mirror the file path (en/services/consulting); the default would prefer a `slug` field.
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/i, ''),
    ...options,
  });

  return {
    name: 'lenient-glob-loader',
    load: async (context) => {
      const { logger } = context;
      const types = (context as LoaderContext & { entryTypes?: Map<string, EntryType> }).entryTypes;

      const entryTypes = types
        ? new Map(
            [...types].map(([ext, type]) => [
              ext,
              {
                ...type,
                async getEntryInfo(params: { fileUrl: URL; contents: string }) {
                  try {
                    return await type.getEntryInfo(params);
                  } catch (error) {
                    logger.warn(`Skipped ${params.fileUrl.pathname}: unreadable frontmatter (${firstLine(error)})`);
                    return { data: { ...BROKEN }, body: '' };
                  }
                },
                ...(type.getRenderFunction && {
                  async getRenderFunction(config: unknown) {
                    const render = await type.getRenderFunction!(config);
                    return async (params: unknown) => {
                      try {
                        return await render(params);
                      } catch (error) {
                        logger.warn(`Rendered ${(params as { filePath?: string }).filePath ?? '?'} empty: ${firstLine(error)}`);
                        return { html: '', metadata: {} };
                      }
                    };
                  },
                }),
              },
            ]),
          )
        : undefined;

      const parseData: LoaderContext['parseData'] = async (props) => {
        try {
          return await context.parseData(props);
        } catch (error) {
          logger.warn(`Skipped ${props.filePath ?? props.id}: invalid frontmatter (${firstLine(error)})`);
          return context.parseData({ ...props, data: { ...BROKEN } as never });
        }
      };

      await inner.load({ ...context, parseData, ...(entryTypes && { entryTypes }) } as LoaderContext);
    },
  };
}
