// Event emitted after a customer submits a new review (needs admin moderation)
export class ReviewCreatedEvent {
  constructor(
    public readonly userId: string, // Who wrote the review
    public readonly userEmail: string, // Reviewer's email
    public readonly userFirstName: string | null, // For display
    public readonly reviewId: string, // Reference for in-app notification
    public readonly productName: string, // Product being reviewed
    public readonly rating: number, // 1-5 star rating
    public readonly title: string, // Review title
  ) {}
}
