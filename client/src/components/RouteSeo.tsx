import { SEO } from "@/components/SEO";
import type { PageMeta } from "@/lib/pageMeta";

type Props = PageMeta;

export function RouteSeo({ title, description, url, noindex }: Props) {
  return <SEO title={title} description={description} url={url} noindex={noindex} />;
}
