export interface StandardProject {
  id: number;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
}

export interface StandardProduct {
  id: number;
  name: string;
  code?: string;
  status?: string;
  type?: string;
  owner?: string;
  qd?: string;
  rd?: string;
}

export interface StandardUser {
  id: number;
  account: string;
  realname?: string;
  role?: string;
  email?: string;
  dept?: number;
}

export interface StandardBuild {
  id: number;
  name: string;
  date?: string;
  builder?: string;
  productId?: number;
  projectId?: number;
  executionId?: number;
  desc?: string;
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
  productId?: number;
  projectId?: number;
  moduleId?: number;
  type?: string;
  resolution?: string;
  resolvedBuild?: string;
  steps?: string;
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
