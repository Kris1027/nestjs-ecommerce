import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { stripHtmlTags } from '../../../common/utils/sanitize.util';

const updateReviewSchema = z
  .object({
    // Same validations as create, but all optional
    rating: z
      .number()
      .int('Rating must be a whole number')
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must be at most 5')
      .optional(),

    // nullish = optional OR null (allows removing the title)
    title: z
      .string()
      .max(100, 'Title must be 100 characters or less')
      .transform(stripHtmlTags)
      .pipe(z.string().min(3, 'Title must be at least 3 characters'))
      .nullish(),

    comment: z
      .string()
      .max(2000, 'Comment must be 2000 characters or less')
      .transform(stripHtmlTags)
      .pipe(z.string().min(10, 'Comment must be at least 10 characters'))
      .optional(),
  })
  // Ensure at least one field is provided — empty updates waste a DB call
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export class UpdateReviewDto extends createZodDto(updateReviewSchema) {}
