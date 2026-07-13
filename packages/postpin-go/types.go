package postpin

// ServiceLevel is a shipping service tier.
type ServiceLevel = string

const (
	ServiceSurface ServiceLevel = "surface"
	ServiceExpress ServiceLevel = "express"
	ServiceSameDay ServiceLevel = "same_day"
)

// RateParams are the inputs to Rates.Calculate. Pointer fields are optional and
// omitted from the request when nil.
type RateParams struct {
	Origin        string
	Destination   string
	Weight        int // grams
	Length        *float64
	Width         *float64
	Height        *float64
	Service       ServiceLevel
	COD           bool
	DeclaredValue *float64 // rupees
	// IdempotencyKey overrides the auto-generated key for this request.
	IdempotencyKey string
}

type rateBody struct {
	Origin        string   `json:"origin"`
	Destination   string   `json:"destination"`
	Weight        int      `json:"weight"`
	Length        *float64 `json:"length,omitempty"`
	Width         *float64 `json:"width,omitempty"`
	Height        *float64 `json:"height,omitempty"`
	Service       string   `json:"service,omitempty"`
	COD           bool     `json:"cod,omitempty"`
	DeclaredValue *float64 `json:"declared_value,omitempty"`
}

// RateEndpoint is the resolved origin/destination of a rate.
type RateEndpoint struct {
	Pincode string `json:"pincode"`
	City    string `json:"city"`
	State   string `json:"state"`
}

// RateBreakdownLine is one line of the rate breakdown.
type RateBreakdownLine struct {
	Label  string  `json:"label"`
	Amount float64 `json:"amount"`
	Hint   string  `json:"hint,omitempty"`
}

// RateResult is the result of a rate calculation.
type RateResult struct {
	Zone                  string              `json:"zone"`
	ZoneLabel             string              `json:"zoneLabel"`
	Service               string              `json:"service"`
	ServiceLabel          string              `json:"serviceLabel"`
	ChargeableWeightGrams int                 `json:"chargeableWeightGrams"`
	VolumetricWeightGrams int                 `json:"volumetricWeightGrams"`
	ETADays               []int               `json:"etaDays"`
	Currency              string              `json:"currency"`
	Breakdown             []RateBreakdownLine `json:"breakdown"`
	Total                 float64             `json:"total"`
	TotalPaise            int                 `json:"totalPaise"`
	Origin                RateEndpoint        `json:"origin"`
	Destination           RateEndpoint        `json:"destination"`
	Serviceable           bool                `json:"serviceable"`
}

// Serviceability is the result of a serviceability check.
type Serviceability struct {
	Pincode     string `json:"pincode"`
	Serviceable bool   `json:"serviceable"`
	Found       bool   `json:"found"`
	City        string `json:"city"`
	State       string `json:"state"`
}

// PincodeNearby is a nearby serviceable pincode.
type PincodeNearby struct {
	Pincode    string  `json:"pincode"`
	City       string  `json:"city"`
	DistanceKM float64 `json:"distance_km"`
}

// Pincode is a full pincode directory entry.
type Pincode struct {
	Pincode     string          `json:"pincode"`
	City        string          `json:"city"`
	District    string          `json:"district"`
	State       string          `json:"state"`
	OfficeName  string          `json:"office_name"`
	IsMetro     bool            `json:"is_metro"`
	IsRemote    bool            `json:"is_remote"`
	Serviceable bool            `json:"serviceable"`
	Nearby      []PincodeNearby `json:"nearby"`
}

// StateSummary is a state with its serviceable-pincode counts.
type StateSummary struct {
	State  string `json:"state"`
	Slug   string `json:"slug"`
	Count  int    `json:"count"`
	Metros int    `json:"metros"`
}

// Plan is a public subscription plan.
type Plan struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	IncludedCalls int    `json:"included_calls"`
}
