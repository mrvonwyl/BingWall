export type Guid = { data1: number; data2: number; data3: number; data4: number[] };

export type Rect = { left: number; top: number; right: number; bottom: number };

export type Monitor = {
  index: number;
  id: string;
  // Null when the monitor is known to Windows but not attached.
  rect: Rect | null;
  width: number;
  height: number;
};
