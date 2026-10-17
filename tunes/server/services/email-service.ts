import Handlebars from 'handlebars';
import { 
  EmailTemplate, InsertEmailTemplate, 
  EmailLog, InsertEmailLog,
  ApiToken
} from '@shared/schema';
import { storage } from '../storage';
import crypto from 'crypto';
import { systemSettingsService } from '../services/system-settings-service';

export class EmailService {
  private fromEmail: string;
  private apiKey: string;
  
  constructor() {
    // Log which Resend environment variables are set for debugging purposes
    console.log('Resend Config:', {
      apiKeySet: !!process.env.RESEND_API_KEY,
      senderEmailSet: !!process.env.RESEND_EMAIL_FROM
    });

    this.apiKey = process.env.RESEND_API_KEY || '';
    this.fromEmail = process.env.RESEND_EMAIL_FROM || 'noreply@example.com';
  }
  
  /**
   * Renders an email template with the provided variables
   */
  private renderTemplate(template: EmailTemplate, variables: Record<string, any>): { html: string; text: string } {
    try {
      // Compile HTML template
      const htmlTemplate = Handlebars.compile(template.html_content);
      const html = htmlTemplate(variables);
      
      // Compile text template
      const textTemplate = Handlebars.compile(template.text_content);
      const text = textTemplate(variables);
      
      return { html, text };
    } catch (error) {
      console.error('Error rendering email template:', error);
      throw new Error(`Failed to render email template: ${(error as Error).message}`);
    }
  }
  
  /**
   * Validates that the required Resend environment variables are set
   */
  public validateConfig(): { isValid: boolean; message?: string } {
    if (!process.env.RESEND_API_KEY) {
      return { isValid: false, message: 'RESEND_API_KEY environment variable is not set' };
    }
    
    if (!process.env.RESEND_EMAIL_FROM) {
      return { isValid: false, message: 'RESEND_EMAIL_FROM environment variable is not set' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Sends an email using a template
   */
  public async sendEmail(
    recipient: string,
    templateId: number,
    variables: Record<string, any>,
    apiTokenId?: number,
    subject?: string
  ): Promise<{ 
    success: boolean; 
    messageId?: string; 
    error?: string;
    permissionError?: boolean;
    emailLogId?: number;
  }> {
    try {
      // Validate Resend config
      const configValidation = this.validateConfig();
      if (!configValidation.isValid) {
        throw new Error(configValidation.message);
      }
      
      /*
       * Suppression gate. Decision D2, 2026-10-08.
       *
       * This is the only place in the server that calls Resend, so this one check covers
       * every email the product sends - verification and reactivation today, anything
       * added later by construction rather than by remembering.
       *
       * It runs before the template is loaded and before the log row is created, so a
       * suppressed address costs one indexed lookup and nothing else. The log row is
       * written anyway, with status 'suppressed': an email that was deliberately not sent
       * is a fact worth keeping, and without it the only record of honouring an
       * unsubscribe would be the absence of a record.
       *
       * `isEmailSuppressed` throws rather than returning false when the lookup fails, and
       * that propagates deliberately. "The database was unreachable" is not evidence of
       * consent, so an outage must not become a send.
       */
      if (await storage.isEmailSuppressed(recipient)) {
        const suppressedLog = await storage.createEmailLog({
          recipient,
          subject: subject ?? `template:${templateId}`,
          templateId,
          status: 'suppressed',
          apiTokenId,
          metadata: variables as any,
        });
        return {
          success: false,
          error: 'Recipient has unsubscribed from email',
          emailLogId: suppressedLog.id,
        };
      }

      // Get template
      const template = await storage.getEmailTemplateById(templateId);
      if (!template) {
        throw new Error(`Email template with ID ${templateId} not found`);
      }
      
      // Render template with variables
      const { html, text } = this.renderTemplate(template, variables);
      
      // Use template subject if no custom subject provided
      const emailSubject = subject || template.subject;
      
      // Create email log first with 'pending' status
      const emailLog = await storage.createEmailLog({
        recipient,
        subject: emailSubject,
        templateId,
        status: 'pending',
        apiTokenId,
        metadata: variables as any
      });
      
      // Send email via Resend REST API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY || this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.RESEND_EMAIL_FROM || this.fromEmail,
          to: [recipient],
          subject: emailSubject,
          html: html,
          text: text
        })
      });

      if (!response.ok) {
        const responseText = await response.text();
        let errorMsg = `Resend API Error: ${response.status} ${response.statusText}`;
        try {
          const parsed = JSON.parse(responseText);
          if (parsed && parsed.message) {
            errorMsg = parsed.message;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const result = await response.json() as any;
      
      // Update log with success status and message ID
      await storage.updateEmailLogStatus(
        emailLog.id,
        'sent',
        result.id
      );
      
      return {
        success: true,
        messageId: result.id,
        emailLogId: emailLog.id
      };
    } catch (error) {
      console.error('Error sending email:', error);
      
      // Check if it's an authorization/API key issue
      const errorMessage = (error as Error).message;
      const isAuthError = 
        errorMessage.includes('Unauthorized') || 
        errorMessage.includes('Invalid API key') ||
        errorMessage.includes('401') ||
        errorMessage.includes('403');
      
      // If email parameters were provided, log the failure
      let emailLogId;
      if (recipient && templateId) {
        try {
          const template = await storage.getEmailTemplateById(templateId);
          if (template) {
            const emailLog = await storage.createEmailLog({
              recipient,
              subject: subject || template.subject,
              templateId,
              status: 'failed',
              apiTokenId,
              errorMessage: (error as Error).message,
              metadata: variables as any
            });
            emailLogId = emailLog.id;
          }
        } catch (logError) {
          console.error('Error creating email log for failed email:', logError);
        }
      }
      
      let friendlyErrorMessage = errorMessage;
      if (isAuthError) {
        friendlyErrorMessage = `Resend authentication issue: Please verify that RESEND_API_KEY is configured correctly and has valid permissions to send emails.`;
      }
      
      return {
        success: false,
        error: friendlyErrorMessage,
        permissionError: isAuthError,
        emailLogId
      };
    }
  }
  
  /**
   * Gets email service usage metrics
   */
  public async getMetrics(): Promise<{
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    daily: { date: string; count: number; status: string }[];
  }> {
    return storage.getEmailStats();
  }
  
  /**
   * Mock verifying an email address for Resend compatibility
   */
  public async verifyEmailAddress(email: string): Promise<{ 
    success: boolean; 
    message?: string;
    permissionError?: boolean;
  }> {
    return {
      success: true,
      message: `With Resend, domain & email configuration is handled on the Resend Dashboard (https://resend.com/domains). Please ensure your domain/sender is configured and verified there.`
    };
  }
  
  /**
   * Mock getting sending quota for Resend compatibility
   */
  public async getSendingQuota(): Promise<{
    max24HourSend: number;
    sentLast24Hours: number;
    maxSendRate: number;
    permissionError?: boolean;
    errorMessage?: string;
  }> {
    return {
      max24HourSend: 100000,
      sentLast24Hours: 0,
      maxSendRate: 10
    };
  }

  /**
   * Generates a verification token for email verification
   */
  public generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sends an email verification email to a user
   */
  public async sendEmailVerification(
    userId: number,
    email: string,
    username: string
  ): Promise<{ 
    success: boolean; 
    message?: string;
    error?: string;
  }> {
    try {
      // Generate verification token and set expiry time (24 hours from now)
      const token = this.generateVerificationToken();
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 24);

      // Update user record with verification token and expiry
      const updated = await storage.updateUserVerificationToken(userId, token, expiryDate);
      if (!updated) {
        throw new Error(`Failed to update user with verification token`);
      }

      // Get the verification email template (ID 6)
      const verificationTemplateId = 6; // ID of the email verification template
      
      // Get app URL from system settings with fallback to BASE_URL env variable
      const baseUrl = await systemSettingsService.getAppUrl();
      
      if (!baseUrl) {
        console.error('Application URL is not configured - cannot send verification email');
        throw new Error('Application URL is not configured. Please set the app_url system setting or BASE_URL environment variable.');
      }
      
      console.log('Using base URL for email verification:', baseUrl);
      const verificationLink = `${baseUrl}/verify-email?token=${token}`;
      
      // Create variables for email template
      const variables = {
        username,
        verificationLink,
        currentYear: new Date().getFullYear().toString()
      };
      
      // Send the verification email
      const result = await this.sendEmail(
        email,
        verificationTemplateId,
        variables
      );
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return {
        success: true,
        message: `Verification email sent to ${email}`
      };
    } catch (error) {
      console.error('Error sending verification email:', error);
      return {
        success: false,
        error: `Failed to send verification email: ${(error as Error).message}`
      };
    }
  }

  /**
   * Verifies a user's email using the verification token
   */
  public async verifyUserEmail(token: string): Promise<{ 
    success: boolean; 
    message?: string;
    error?: string;
    userId?: number;
  }> {
    try {
      // Find user with matching verification token
      const user = await storage.getUserByVerificationToken(token);
      
      if (!user) {
        return {
          success: false,
          error: 'Invalid or expired verification token'
        };
      }
      
      // Check if token is expired
      if (user.emailVerificationExpiry && new Date() > new Date(user.emailVerificationExpiry)) {
        return {
          success: false,
          error: 'Verification token has expired'
        };
      }
      
      // Update user to mark email as verified and clear token
      const updated = await storage.markEmailAsVerified(user.id);
      
      if (!updated) {
        throw new Error('Failed to mark email as verified');
      }
      
      return {
        success: true,
        message: 'Email verified successfully',
        userId: user.id
      };
    } catch (error) {
      console.error('Error verifying email:', error);
      return {
        success: false,
        error: `Failed to verify email: ${(error as Error).message}`
      };
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();