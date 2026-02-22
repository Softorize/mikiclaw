interface AccessGrant {
  grantedAt: number;
}

class AccessControl {
  private appleScriptGrants = new Map<string, AccessGrant>();

  private key(userId: string, chatId: number): string {
    return `${chatId}:${userId}`;
  }

  grantAppleScript(userId: string, chatId: number): void {
    this.appleScriptGrants.set(this.key(userId, chatId), {
      grantedAt: Date.now()
    });
  }

  revokeAppleScript(userId: string, chatId: number): void {
    this.appleScriptGrants.delete(this.key(userId, chatId));
  }

  hasAppleScriptAccess(userId: string, chatId: number): boolean {
    return this.appleScriptGrants.has(this.key(userId, chatId));
  }

  getAppleScriptGrantTime(userId: string, chatId: number): number | null {
    const grant = this.appleScriptGrants.get(this.key(userId, chatId));
    return grant?.grantedAt || null;
  }
}

export const accessControl = new AccessControl();

