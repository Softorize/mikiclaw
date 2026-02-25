interface AccessGrant {
  grantedAt: number;
}

export interface ToolApprovalRequest {
  id: string;
  userId: string;
  chatId: number;
  toolName: string;
  inputHash: string;
  summary: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'denied';
}

class AccessControl {
  private appleScriptGrants = new Map<string, AccessGrant>();
  private toolApprovals = new Map<string, ToolApprovalRequest[]>();

  private key(userId: string, chatId: number): string {
    return `${chatId}:${userId}`;
  }

  private inputHash(input: Record<string, unknown>): string {
    return JSON.stringify(input);
  }

  private pruneExpired(requests: ToolApprovalRequest[]): ToolApprovalRequest[] {
    const now = Date.now();
    return requests.filter(request => request.expiresAt > now && request.status !== 'denied');
  }

  grantAppleScript(userId: string, chatId: number): void {
    this.appleScriptGrants.set(this.key(userId, chatId), {
      grantedAt: Date.now(),
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

  requestToolApproval(
    userId: string,
    chatId: number,
    toolName: string,
    input: Record<string, unknown>,
    summary: string
  ): ToolApprovalRequest {
    const key = this.key(userId, chatId);
    const hash = this.inputHash(input);
    const existing = this.pruneExpired(this.toolApprovals.get(key) || []);

    const duplicate = existing.find(
      request =>
        request.status === 'pending' && request.toolName === toolName && request.inputHash === hash
    );
    if (duplicate) {
      this.toolApprovals.set(key, existing);
      return duplicate;
    }

    const request: ToolApprovalRequest = {
      id: `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      chatId,
      toolName,
      inputHash: hash,
      summary,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
      status: 'pending',
    };

    existing.push(request);
    this.toolApprovals.set(key, existing);
    return request;
  }

  listPendingToolApprovals(userId: string, chatId: number): ToolApprovalRequest[] {
    const key = this.key(userId, chatId);
    const active = this.pruneExpired(this.toolApprovals.get(key) || []);
    this.toolApprovals.set(key, active);
    return active.filter(request => request.status === 'pending');
  }

  approveToolApproval(userId: string, chatId: number, id?: string): ToolApprovalRequest | null {
    const key = this.key(userId, chatId);
    const active = this.pruneExpired(this.toolApprovals.get(key) || []);
    const target = id
      ? active.find(request => request.id === id && request.status === 'pending')
      : [...active].reverse().find(request => request.status === 'pending');

    if (!target) {
      this.toolApprovals.set(key, active);
      return null;
    }

    target.status = 'approved';
    this.toolApprovals.set(key, active);
    return target;
  }

  denyToolApproval(userId: string, chatId: number, id?: string): ToolApprovalRequest | null {
    const key = this.key(userId, chatId);
    const active = this.pruneExpired(this.toolApprovals.get(key) || []);
    const target = id
      ? active.find(request => request.id === id && request.status === 'pending')
      : [...active].reverse().find(request => request.status === 'pending');

    if (!target) {
      this.toolApprovals.set(key, active);
      return null;
    }

    target.status = 'denied';
    this.toolApprovals.set(key, active);
    return target;
  }

  consumeApprovedToolAction(
    userId: string,
    chatId: number,
    toolName: string,
    input: Record<string, unknown>
  ): ToolApprovalRequest | null {
    const key = this.key(userId, chatId);
    const active = this.pruneExpired(this.toolApprovals.get(key) || []);
    const hash = this.inputHash(input);
    const index = active.findIndex(
      request =>
        request.status === 'approved' && request.toolName === toolName && request.inputHash === hash
    );

    if (index === -1) {
      this.toolApprovals.set(key, active);
      return null;
    }

    const [approved] = active.splice(index, 1);
    this.toolApprovals.set(key, active);
    return approved;
  }
}

export const accessControl = new AccessControl();
