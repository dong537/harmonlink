// External Work domain types
// 用于处理外部任务和异步作业

export interface LeaseCompletionContext {
  workerId: string;
  desiredVersion: number;
  now: Date;
  onStale: () => never;
}

export type LeasedJob = {
  desiredVersion: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

export function assertLeaseCompletion(job: LeasedJob, context: LeaseCompletionContext): void {
  const held = job.leaseOwner === context.workerId
    && job.leaseExpiresAt !== null
    && job.leaseExpiresAt.getTime() > context.now.getTime();
  if (!held || job.desiredVersion !== context.desiredVersion) context.onStale();
}
