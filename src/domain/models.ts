export interface StandardProject {
  id: number;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
}

export interface StandardStory {
  id: number;
  title: string;
  status?: string;
  stage?: string;
  priority?: string;
  openedBy?: string;
  assignedTo?: string;
}

export interface StandardTask {
  id: number;
  title: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  deadline?: string;
  estimateHours?: number;
  consumedHours?: number;
}

export interface StandardBug {
  id: number;
  title: string;
  status?: string;
  severity?: string;
  priority?: string;
  openedBy?: string;
  assignedTo?: string;
  resolvedBy?: string;
}

export interface StandardExecution {
  id: number;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  projectId?: number;
  owner?: string;
}

export interface StandardListResult<T> {
  items: T[];
  total?: number;
  filteredTotal?: number;
  raw: unknown;
}

export interface StandardDetailResult<T> {
  item: T | null;
  raw: unknown;
}
