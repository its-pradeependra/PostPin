/** Seed sample pincodes (real). Full India Post import is the M6 pincode milestone. */
export interface SeedPincode {
  pincode: string;
  city: string;
  state: string;
  stateCode: string;
  isMetro: boolean;
  isRemote: boolean;
}

// Remote/special first-2 prefixes (NE states, J&K, islands).
const REMOTE_PREFIXES = ["19", "18", "74", "79", "78", "73"];
const isRemote = (pin: string) => REMOTE_PREFIXES.includes(pin.slice(0, 2));

const RAW: Array<[string, string, string, string, boolean]> = [
  ["110001", "New Delhi", "Delhi", "DL", true],
  ["400001", "Mumbai", "Maharashtra", "MH", true],
  ["560001", "Bengaluru", "Karnataka", "KA", true],
  ["600001", "Chennai", "Tamil Nadu", "TN", true],
  ["700001", "Kolkata", "West Bengal", "WB", true],
  ["500001", "Hyderabad", "Telangana", "TG", true],
  ["411001", "Pune", "Maharashtra", "MH", true],
  ["380001", "Ahmedabad", "Gujarat", "GJ", true],
  ["302001", "Jaipur", "Rajasthan", "RJ", false],
  ["226001", "Lucknow", "Uttar Pradesh", "UP", false],
  ["160017", "Chandigarh", "Chandigarh", "CH", false],
  ["682001", "Kochi", "Kerala", "KL", false],
  ["751001", "Bhubaneswar", "Odisha", "OD", false],
  ["781001", "Guwahati", "Assam", "AS", false],
  ["190001", "Srinagar", "Jammu & Kashmir", "JK", false],
  ["744101", "Port Blair", "Andaman & Nicobar", "AN", false],
  ["403001", "Panaji", "Goa", "GA", false],
  ["248001", "Dehradun", "Uttarakhand", "UK", false],
  ["800001", "Patna", "Bihar", "BR", false],
  ["462001", "Bhopal", "Madhya Pradesh", "MP", false],
];

export const SEED_PINCODES: SeedPincode[] = RAW.map(([pincode, city, state, stateCode, metro]) => ({
  pincode,
  city,
  state,
  stateCode,
  isMetro: metro,
  isRemote: isRemote(pincode),
}));
