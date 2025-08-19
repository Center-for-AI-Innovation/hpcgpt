import { SlashCommand } from './SlashCommand.js';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessageT } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * SLURM job information interface
 */
interface SlurmJob {
  jobId: string;
  jobName: string;
  user: string;
  account: string;
  partition: string;
  state: string;
  exitCode: string;
  submit: string;
  start: string;
  end: string;
  elapsed: string;
  timelimit: string;
  cpuTime: string;
  maxRSS: string;
  maxDiskRead: string;
  maxDiskWrite: string;
  allocCPUS: string;
  reqMem: string;
}

/**
 * SLURM MCP Command: Provides comprehensive SLURM job querying capabilities
 */
export class SlurmCommand extends SlashCommand {
  constructor() {
    super('slurm', 'Query SLURM jobs and cluster information');
  }

  async execute(ctx: {
    args: string[];
    history: ChatMessageT[];
    setHistory: Dispatch<SetStateAction<ChatMessageT[]>>;
    setInput: Dispatch<SetStateAction<string>>;
    commands: SlashCommand[];
  }): Promise<void> {
    const { args, history, setHistory, setInput } = ctx;

    // Record the /slurm command
    const userEntry: ChatMessageT = {
      role: 'user',
      content: `/${this.name}${args.length ? ` ${args.join(' ')}` : ''}`,
    };
    const newHistory = [...history, userEntry];
    setHistory(newHistory);

    try {
      let result: string;

      if (args.length === 0) {
        // Show help for slurm command
        result = this.getHelpText();
      } else {
        const subcommand = args[0].toLowerCase();
        const subArgs = args.slice(1);

        switch (subcommand) {
          case 'jobs':
          case 'myjobs':
            result = await this.getMyJobs(subArgs);
            break;
          case 'job':
            result = await this.getJobDetails(subArgs);
            break;
          case 'running':
            result = await this.getRunningJobs(subArgs);
            break;
          case 'completed':
            result = await this.getCompletedJobs(subArgs);
            break;
          case 'failed':
            result = await this.getFailedJobs(subArgs);
            break;
          case 'queue':
            result = await this.getQueueStatus();
            break;
          case 'nodes':
            result = await this.getNodeInfo();
            break;
          case 'usage':
            result = await this.getUsageStats(subArgs);
            break;
          case 'efficiency':
            result = await this.getJobEfficiency(subArgs);
            break;
          default:
            result = `Unknown subcommand: ${subcommand}\n\n${this.getHelpText()}`;
        }
      }

      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: result },
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: `SLURM command failed: ${message}` },
      ]);
    }

    setInput('');
  }

  private getHelpText(): string {
    return `SLURM MCP Command Usage:
/slurm jobs [user] - Show all jobs for current user or specified user
/slurm job <jobid> - Show detailed information for specific job
/slurm running [user] - Show currently running jobs
/slurm completed [days] - Show completed jobs (default: last 7 days)
/slurm failed [days] - Show failed jobs (default: last 7 days)
/slurm queue - Show current queue status (squeue)
/slurm nodes - Show node information (sinfo)
/slurm usage [days] - Show resource usage statistics
/slurm efficiency <jobid> - Show job efficiency metrics

Examples:
/slurm jobs - Show your jobs
/slurm job 12345 - Details for job 12345
/slurm running - Your running jobs
/slurm completed 30 - Completed jobs from last 30 days`;
  }

  private async getMyJobs(args: string[]): Promise<string> {
    const user = args[0] || process.env.USER || '$USER';
    const cmd = `sacct -u ${user} --format=JobID,JobName,Partition,Account,State,ExitCode,Submit,Start,End,Elapsed,TimeLimit,AllocCPUS,ReqMem,MaxRSS --parsable2 --noheader -S $(date -d '7 days ago' '+%Y-%m-%d')`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No jobs found for user ${user} in the last 7 days.`;
    }

    return this.formatJobList(jobs, `Jobs for user ${user} (last 7 days)`);
  }

  private async getJobDetails(args: string[]): Promise<string> {
    if (args.length === 0) {
      return 'Please provide a job ID. Usage: /slurm job <jobid>';
    }

    const jobId = args[0];
    const cmd = `sacct -j ${jobId} --format=JobID,JobName,Partition,Account,State,ExitCode,Submit,Start,End,Elapsed,TimeLimit,AllocCPUS,ReqMem,MaxRSS,MaxDiskRead,MaxDiskWrite,CPUTime --parsable2 --noheader`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No job found with ID: ${jobId}`;
    }

    return this.formatJobDetails(jobs[0]);
  }

  private async getRunningJobs(args: string[]): Promise<string> {
    const user = args[0] || process.env.USER || '$USER';
    const cmd = `squeue -u ${user} --format="%.18i %.9P %.20j %.8u %.8T %.10M %.9l %.6D %R" --noheader`;
    
    const { stdout } = await execAsync(cmd);
    
    if (!stdout.trim()) {
      return `No running jobs found for user ${user}.`;
    }

    return `Running jobs for user ${user}:\n\`\`\`\n` +
           `JOBID     PARTITION NAME                 USER     ST       TIME  TIME_LIMI NODES NODELIST(REASON)\n` +
           stdout + `\`\`\``;
  }

  private async getCompletedJobs(args: string[]): Promise<string> {
    const days = args[0] ? parseInt(args[0]) : 7;
    const user = process.env.USER || '$USER';
    const cmd = `sacct -u ${user} --state=COMPLETED --format=JobID,JobName,Partition,State,ExitCode,Start,End,Elapsed,AllocCPUS,ReqMem,MaxRSS --parsable2 --noheader -S $(date -d '${days} days ago' '+%Y-%m-%d')`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No completed jobs found in the last ${days} days.`;
    }

    return this.formatJobList(jobs, `Completed jobs (last ${days} days)`);
  }

  private async getFailedJobs(args: string[]): Promise<string> {
    const days = args[0] ? parseInt(args[0]) : 7;
    const user = process.env.USER || '$USER';
    const cmd = `sacct -u ${user} --state=FAILED,CANCELLED,TIMEOUT,NODE_FAIL --format=JobID,JobName,Partition,State,ExitCode,Start,End,Elapsed,AllocCPUS,ReqMem --parsable2 --noheader -S $(date -d '${days} days ago' '+%Y-%m-%d')`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No failed jobs found in the last ${days} days.`;
    }

    return this.formatJobList(jobs, `Failed jobs (last ${days} days)`);
  }

  private async getQueueStatus(): Promise<string> {
    const cmd = `squeue --format="%.18i %.9P %.20j %.8u %.8T %.10M %.9l %.6D %R" --sort=-p`;
    
    const { stdout } = await execAsync(cmd);
    
    return `Current queue status:\n\`\`\`\n${stdout}\`\`\``;
  }

  private async getNodeInfo(): Promise<string> {
    const cmd = `sinfo --format="%.10P %.5a %.10l %.6D %.6t %.14N %.4c %.8m %.8d %.9O %.7T"`;
    
    const { stdout } = await execAsync(cmd);
    
    return `Node information:\n\`\`\`\n${stdout}\`\`\``;
  }

  private async getUsageStats(args: string[]): Promise<string> {
    const days = args[0] ? parseInt(args[0]) : 7;
    const user = process.env.USER || '$USER';
    
    // Get job stats
    const cmd = `sacct -u ${user} --format=JobID,State,AllocCPUS,ReqMem,Elapsed,CPUTime --parsable2 --noheader -S $(date -d '${days} days ago' '+%Y-%m-%d')`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No usage data found for the last ${days} days.`;
    }

    // Calculate statistics
    const stats = this.calculateUsageStats(jobs);
    
    return `Usage statistics for last ${days} days:\n\`\`\`\n` +
           `Total jobs: ${stats.totalJobs}\n` +
           `Completed: ${stats.completed}\n` +
           `Failed: ${stats.failed}\n` +
           `Running: ${stats.running}\n` +
           `Total CPU hours: ${stats.totalCpuHours.toFixed(2)}\n` +
           `Average job duration: ${stats.avgDuration}\n` +
           `Total allocated CPUs: ${stats.totalAllocCpus}\n` +
           `\`\`\``;
  }

  private async getJobEfficiency(args: string[]): Promise<string> {
    if (args.length === 0) {
      return 'Please provide a job ID. Usage: /slurm efficiency <jobid>';
    }

    const jobId = args[0];
    const cmd = `sacct -j ${jobId} --format=JobID,State,AllocCPUS,ReqMem,MaxRSS,Elapsed,CPUTime,MaxDiskRead,MaxDiskWrite --parsable2 --noheader`;
    
    const { stdout } = await execAsync(cmd);
    const jobs = this.parseSacctOutput(stdout);
    
    if (jobs.length === 0) {
      return `No job found with ID: ${jobId}`;
    }

    const efficiency = this.calculateJobEfficiency(jobs[0]);
    
    return `Job ${jobId} efficiency:\n\`\`\`\n` +
           `CPU Efficiency: ${efficiency.cpuEfficiency}%\n` +
           `Memory Efficiency: ${efficiency.memoryEfficiency}%\n` +
           `Wall Time: ${jobs[0].elapsed}\n` +
           `CPU Time: ${jobs[0].cpuTime}\n` +
           `Max Memory Used: ${jobs[0].maxRSS}\n` +
           `Memory Requested: ${jobs[0].reqMem}\n` +
           `\`\`\``;
  }

  private parseSacctOutput(output: string): SlurmJob[] {
    const lines = output.trim().split('\n').filter(line => line.trim());
    const jobs: SlurmJob[] = [];

    for (const line of lines) {
      const fields = line.split('|');
      if (fields.length >= 11) {
        jobs.push({
          jobId: fields[0] || '',
          jobName: fields[1] || '',
          partition: fields[2] || '',
          account: fields[3] || '',
          state: fields[4] || '',
          exitCode: fields[5] || '',
          submit: fields[6] || '',
          start: fields[7] || '',
          end: fields[8] || '',
          elapsed: fields[9] || '',
          timelimit: fields[10] || '',
          allocCPUS: fields[11] || '',
          reqMem: fields[12] || '',
          maxRSS: fields[13] || '',
          maxDiskRead: fields[14] || '',
          maxDiskWrite: fields[15] || '',
          cpuTime: fields[16] || ''
        });
      }
    }

    return jobs;
  }

  private formatJobList(jobs: SlurmJob[], title: string): string {
    let result = `${title}:\n\`\`\`\n`;
    result += `JobID        JobName              State      ExitCode Submit               Elapsed    CPUs Memory\n`;
    result += `------------ -------------------- ---------- -------- -------------------- ---------- ---- --------\n`;

    for (const job of jobs.slice(0, 20)) { // Limit to 20 jobs for readability
      result += `${job.jobId.padEnd(12)} ${job.jobName.slice(0, 20).padEnd(20)} ${job.state.padEnd(10)} ${job.exitCode.padEnd(8)} ${job.submit.padEnd(20)} ${job.elapsed.padEnd(10)} ${job.allocCPUS.padEnd(4)} ${job.reqMem}\n`;
    }

    if (jobs.length > 20) {
      result += `\n... and ${jobs.length - 20} more jobs\n`;
    }

    result += `\`\`\``;
    return result;
  }

  private formatJobDetails(job: SlurmJob): string {
    return `Job Details for ${job.jobId}:\n\`\`\`\n` +
           `Job ID: ${job.jobId}\n` +
           `Job Name: ${job.jobName}\n` +
           `User: ${job.user}\n` +
           `Account: ${job.account}\n` +
           `Partition: ${job.partition}\n` +
           `State: ${job.state}\n` +
           `Exit Code: ${job.exitCode}\n` +
           `Submit Time: ${job.submit}\n` +
           `Start Time: ${job.start}\n` +
           `End Time: ${job.end}\n` +
           `Elapsed Time: ${job.elapsed}\n` +
           `Time Limit: ${job.timelimit}\n` +
           `Allocated CPUs: ${job.allocCPUS}\n` +
           `Requested Memory: ${job.reqMem}\n` +
           `Max Memory Used: ${job.maxRSS}\n` +
           `CPU Time: ${job.cpuTime}\n` +
           `Max Disk Read: ${job.maxDiskRead}\n` +
           `Max Disk Write: ${job.maxDiskWrite}\n` +
           `\`\`\``;
  }

  private calculateUsageStats(jobs: SlurmJob[]) {
    const stats = {
      totalJobs: jobs.length,
      completed: 0,
      failed: 0,
      running: 0,
      totalCpuHours: 0,
      avgDuration: '0:00:00',
      totalAllocCpus: 0
    };

    let totalSeconds = 0;

    for (const job of jobs) {
      if (job.state === 'COMPLETED') stats.completed++;
      else if (['FAILED', 'CANCELLED', 'TIMEOUT'].includes(job.state)) stats.failed++;
      else if (job.state === 'RUNNING') stats.running++;

      const allocCpus = parseInt(job.allocCPUS) || 0;
      stats.totalAllocCpus += allocCpus;

      // Parse elapsed time and calculate CPU hours
      const elapsedSeconds = this.parseTimeToSeconds(job.elapsed);
      totalSeconds += elapsedSeconds;
      stats.totalCpuHours += (elapsedSeconds * allocCpus) / 3600;
    }

    if (jobs.length > 0) {
      const avgSeconds = totalSeconds / jobs.length;
      stats.avgDuration = this.secondsToTimeString(avgSeconds);
    }

    return stats;
  }

  private calculateJobEfficiency(job: SlurmJob) {
    const allocCpus = parseInt(job.allocCPUS) || 1;
    const elapsedSeconds = this.parseTimeToSeconds(job.elapsed);
    const cpuTimeSeconds = this.parseTimeToSeconds(job.cpuTime);
    
    const cpuEfficiency = elapsedSeconds > 0 ? Math.round((cpuTimeSeconds / (elapsedSeconds * allocCpus)) * 100) : 0;
    
    // Parse memory usage
    const maxMemKB = this.parseMemoryToKB(job.maxRSS);
    const reqMemKB = this.parseMemoryToKB(job.reqMem);
    const memoryEfficiency = reqMemKB > 0 ? Math.round((maxMemKB / reqMemKB) * 100) : 0;

    return {
      cpuEfficiency: Math.min(cpuEfficiency, 100),
      memoryEfficiency: Math.min(memoryEfficiency, 100)
    };
  }

  private parseTimeToSeconds(timeStr: string): number {
    if (!timeStr || timeStr === 'Unknown') return 0;
    
    const parts = timeStr.split('-');
    let totalSeconds = 0;
    
    // Handle days-hours:minutes:seconds format
    if (parts.length === 2) {
      totalSeconds += parseInt(parts[0]) * 24 * 3600; // days
      timeStr = parts[1];
    } else {
      timeStr = parts[0];
    }
    
    // Handle hours:minutes:seconds format
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 3) {
      totalSeconds += parseInt(timeParts[0]) * 3600; // hours
      totalSeconds += parseInt(timeParts[1]) * 60;   // minutes
      totalSeconds += parseInt(timeParts[2]);        // seconds
    }
    
    return totalSeconds;
  }

  private parseMemoryToKB(memStr: string): number {
    if (!memStr || memStr === 'Unknown') return 0;
    
    const match = memStr.match(/(\d+(?:\.\d+)?)(.*)/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'K':
      case 'KB':
        return value;
      case 'M':
      case 'MB':
        return value * 1024;
      case 'G':
      case 'GB':
        return value * 1024 * 1024;
      case 'T':
      case 'TB':
        return value * 1024 * 1024 * 1024;
      default:
        return value; // Assume KB if no unit
    }
  }

  private secondsToTimeString(seconds: number): string {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) {
      return `${days}-${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }
}
