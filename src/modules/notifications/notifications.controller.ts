import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser, Roles } from '../../common/decorators';
import {
  AdminNotificationDto,
  CountResponseDto,
  NotificationDto,
  NotificationPreferenceDto,
  NotificationQueryDto,
  UpdatePreferenceDto,
} from './dto';
import {
  ApiErrorResponses,
  ApiPaginatedResponse,
  ApiSuccessListResponse,
  ApiSuccessResponse,
} from '../../common/swagger';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ============================================
  // CUSTOMER ENDPOINTS (authenticated, any role)
  // ============================================

  // List my notifications (paginated, filterable by isRead and type)
  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  @ApiQuery({
    name: 'isRead',
    required: false,
    enum: ['true', 'false'],
    description: 'Filter by read/unread status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
      'ORDER_CANCELLED',
      'PAYMENT_SUCCEEDED',
      'PAYMENT_FAILED',
      'REFUND_INITIATED',
      'REFUND_COMPLETED',
      'REFUND_FAILED',
      'REFUND_REQUEST_CREATED',
      'REVIEW_CREATED',
      'LOW_STOCK',
      'WELCOME',
      'PASSWORD_CHANGED',
    ],
    description: 'Filter by notification type',
  })
  @ApiPaginatedResponse(NotificationDto, 'Paginated notification list')
  @ApiErrorResponses(401, 429)
  findUserNotifications(
    @CurrentUser('sub') userId: string,
    @Query() query: NotificationQueryDto,
  ): ReturnType<NotificationsService['findUserNotifications']> {
    return this.notificationsService.findUserNotifications(userId, query);
  }

  // Get unread count for UI notification badge
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiSuccessResponse(CountResponseDto, 200, 'Unread count')
  @ApiErrorResponses(401, 429)
  getUnreadCount(
    @CurrentUser('sub') userId: string,
  ): ReturnType<NotificationsService['getUnreadCount']> {
    return this.notificationsService.getUnreadCount(userId);
  }

  // Mark a single notification as read
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(NotificationDto, 200, 'Notification marked as read')
  @ApiErrorResponses(401, 404, 429)
  markAsRead(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): ReturnType<NotificationsService['markAsRead']> {
    return this.notificationsService.markAsRead(userId, id);
  }

  // Mark a single notification as unread
  @Patch(':id/unread')
  @ApiOperation({ summary: 'Mark a notification as unread' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(NotificationDto, 200, 'Notification marked as unread')
  @ApiErrorResponses(401, 404, 429)
  markAsUnread(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): ReturnType<NotificationsService['markAsUnread']> {
    return this.notificationsService.markAsUnread(userId, id);
  }

  // Mark all my notifications as read
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiSuccessResponse(CountResponseDto, 200, 'Number of notifications marked as read')
  @ApiErrorResponses(401, 429)
  markAllAsRead(
    @CurrentUser('sub') userId: string,
  ): ReturnType<NotificationsService['markAllAsRead']> {
    return this.notificationsService.markAllAsRead(userId);
  }

  // Delete all read notifications
  @Delete('read')
  @ApiOperation({ summary: 'Delete all read notifications' })
  @ApiSuccessResponse(CountResponseDto, 200, 'Number of notifications deleted')
  @ApiErrorResponses(401, 429)
  deleteAllRead(
    @CurrentUser('sub') userId: string,
  ): ReturnType<NotificationsService['deleteAllRead']> {
    return this.notificationsService.deleteAllRead(userId);
  }

  // Delete a single notification
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(NotificationDto, 200, 'Notification deleted')
  @ApiErrorResponses(401, 404, 429)
  async deleteOne(@CurrentUser('sub') userId: string, @Param('id') id: string): Promise<void> {
    return this.notificationsService.deleteOne(userId, id);
  }

  // Get my notification preferences
  @Get('preferences')
  @ApiOperation({ summary: 'Get my notification preferences' })
  @ApiSuccessListResponse(NotificationPreferenceDto, 'Notification preferences')
  @ApiErrorResponses(401, 429)
  getPreferences(
    @CurrentUser('sub') userId: string,
  ): ReturnType<NotificationsService['getPreferences']> {
    return this.notificationsService.getPreferences(userId);
  }

  // Update a single notification preference (type + channel + enabled)
  @Put('preferences')
  @ApiOperation({ summary: 'Update a notification preference' })
  @ApiSuccessResponse(NotificationPreferenceDto, 200, 'Preference updated')
  @ApiErrorResponses(400, 401, 429)
  updatePreference(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePreferenceDto,
  ): ReturnType<NotificationsService['updatePreference']> {
    return this.notificationsService.updatePreference(userId, dto);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  // Admin views all notifications across all users
  @Get('admin')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all notifications across all users (admin)' })
  @ApiQuery({
    name: 'isRead',
    required: false,
    enum: ['true', 'false'],
    description: 'Filter by read/unread status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
      'ORDER_CANCELLED',
      'PAYMENT_SUCCEEDED',
      'PAYMENT_FAILED',
      'REFUND_INITIATED',
      'REFUND_COMPLETED',
      'REFUND_FAILED',
      'REFUND_REQUEST_CREATED',
      'REVIEW_CREATED',
      'LOW_STOCK',
      'WELCOME',
      'PASSWORD_CHANGED',
    ],
    description: 'Filter by notification type',
  })
  @ApiPaginatedResponse(AdminNotificationDto, 'Paginated notification list with userId')
  @ApiErrorResponses(401, 403, 429)
  findAll(@Query() query: NotificationQueryDto): ReturnType<NotificationsService['findAll']> {
    return this.notificationsService.findAll(query);
  }

  // Admin mark any notification as read (no ownership check)
  @Patch('admin/:id/read')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Mark any notification as read (admin)' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(AdminNotificationDto, 200, 'Notification marked as read')
  @ApiErrorResponses(401, 403, 404, 429)
  adminMarkAsRead(@Param('id') id: string): ReturnType<NotificationsService['adminMarkAsRead']> {
    return this.notificationsService.adminMarkAsRead(id);
  }

  // Admin mark any notification as unread (no ownership check)
  @Patch('admin/:id/unread')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Mark any notification as unread (admin)' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(AdminNotificationDto, 200, 'Notification marked as unread')
  @ApiErrorResponses(401, 403, 404, 429)
  adminMarkAsUnread(
    @Param('id') id: string,
  ): ReturnType<NotificationsService['adminMarkAsUnread']> {
    return this.notificationsService.adminMarkAsUnread(id);
  }

  // Admin delete all read notifications across all users
  // Must be declared before admin/:id to avoid route collision
  @Delete('admin/read')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete all read notifications across all users (admin)' })
  @ApiSuccessResponse(CountResponseDto, 200, 'Number of notifications deleted')
  @ApiErrorResponses(401, 403, 429)
  adminDeleteAllRead(): ReturnType<NotificationsService['adminDeleteAllRead']> {
    return this.notificationsService.adminDeleteAllRead();
  }

  // Admin delete any notification (no ownership check)
  @Delete('admin/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete any notification (admin)' })
  @ApiParam({ name: 'id', description: 'Notification CUID' })
  @ApiSuccessResponse(AdminNotificationDto, 200, 'Notification deleted')
  @ApiErrorResponses(401, 403, 404, 429)
  adminDeleteOne(@Param('id') id: string): Promise<void> {
    return this.notificationsService.adminDeleteOne(id);
  }
}
