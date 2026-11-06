import { oc as contractBuilder } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

const oc = contractBuilder.errors({})

/**
 * Session-only routes that clients read to decide whether to show cloud save.
 * Clients never decide on their own; they only trust this response.
 */
export const UserFeaturesSchema = z.object({
  cloudSave: z.boolean(),
  serverImports: z.boolean(),
  optInAvailable: z.boolean(),
})
export type UserFeatures = z.infer<typeof UserFeaturesSchema>

export const CloudSaveOptInInputSchema = z
  .object({
    /** The version of the cloud save privacy terms the user agreed to. */
    consentVersion: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[\w.-]+$/),
  })
  .strict()

/** Every private route carries this tag, which keeps it out of the public OpenAPI document. */
export const PRIVATE_CLOUD_SAVE_TAGS = ['internal', 'cloud-save']

export const featuresContract = {
  get: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/me/features',
        summary: 'Read the features enabled for the signed-in user',
        tags: PRIVATE_CLOUD_SAVE_TAGS,
      }),
    )
    .output(UserFeaturesSchema),
  optInCloudSave: oc
    .meta(
      openapi({
        method: 'POST',
        path: '/me/features/cloud-save/opt-in',
        summary: 'Opt in to the cloud save beta',
        tags: PRIVATE_CLOUD_SAVE_TAGS,
      }),
    )
    .input(CloudSaveOptInInputSchema)
    .output(UserFeaturesSchema),
}