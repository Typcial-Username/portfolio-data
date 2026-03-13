import { z } from "zod";
import path from "node:path";
import fs from "node:fs";

//#region Constants
const RepoSlug = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const Objective = z.enum([
  "RES-1",
  "RES-2",
  "RES-3",
  "RES-4",
  "RES-5",
  "RES-6",

  "DMF-1",
  "DMF-2",
  "DMF-3",
  "DMF-4",
  "DMF-5",
  "DMF-6",
]);
const IMAGE_ROOT = path.resolve("images");
const DOCS_ROOT = path.resolve("docs");

const Status = z.enum(["public", "private"]);

const ImagePath = z.string().regex(/\.(png|jpg|jpeg|webp)$/i);
//#endregion

export const MediaSchema = z
  .object({
    images: z.array(ImagePath).optional(),
    docs: z.array(z.string()).optional(),
    modelViewer: z.url().optional(),
  })
  .superRefine((media, ctx) => {
    if (!media.images) return;
    if (!media.docs) return;

    for (const img of media.images) {
      const fullPath = path.join(IMAGE_ROOT, img);

      if (!fs.existsSync(fullPath)) {
        ctx.addIssue({
          code: "custom",
          message: `Image not found ${img}`,
        });
      }
    }

    for (const doc of media.docs) {
      const fullPath = path.join(DOCS_ROOT, doc);

      if (!fs.existsSync(fullPath)) {
        ctx.addIssue({
          code: "custom",
          message: `Document not found ${doc}`,
        });
      }
    }
  });

export const ProjectSchema = z.object({
  id: z.string(),
  repo: RepoSlug.optional().nullable(),

  title: z.string(),
  description: z.string().optional(),

  course: z.string().optional(),
  objectives: z
    .object({
      RES: z.object({ code: z.array(Objective), reason: z.string() }),
      DMF: z.object({ code: z.array(Objective), reason: z.string() }),
    })
    .optional(),

  media: MediaSchema.optional(),
  files: z
    .object({
      cad: z.array(z.string()).optional(),
      stl: z.array(z.string()).optional(),
    })
    .optional(),

  status: Status.optional(),
  visibility: Status.optional(),
});

export const ProjectsSchema = z.object({
  projects: z.array(ProjectSchema),
});

export type Projects = z.infer<typeof ProjectsSchema>;
