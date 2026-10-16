import type { MetadataRoute } from "next";
import { getMetadataBase } from "@/i18n/metadata";
import { buildRobots } from "@/lib/seo/robots";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getMetadataBase());
}
