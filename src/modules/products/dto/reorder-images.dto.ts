import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const reorderImagesSchema = z.object({
  imageIds: z.array(z.string().cuid()).nonempty('At least one image ID is required'),
});

export class ReorderImagesDto extends createZodDto(reorderImagesSchema) {}
