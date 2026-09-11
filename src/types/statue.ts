export interface StatueProperties {
  id: string;
  name: string;
  province: string;
  city: string;
  address: string;
  desc?: string;
  background?: string;
  year?: string;
  image?: string;
  source?: string;
  sourceId?: string;
  sourceType?: string;
  verificationStatus?: 'verified' | 'user_verified' | 'amap_unverified';
  collectedAt?: string;
}

export interface StatueGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface StatueFeature {
  type: 'Feature';
  geometry: StatueGeometry;
  properties: StatueProperties;
}

export interface StatueCollection {
  type: 'FeatureCollection';
  features: StatueFeature[];
}

export interface FocusRequest {
  feature: StatueFeature;
  nonce: number;
}
