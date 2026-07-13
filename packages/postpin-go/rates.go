package postpin

import (
	"context"
	"net/http"
)

// RatesService calculates shipping rates.
type RatesService struct{ client *Client }

// Calculate computes the shipping rate between two Indian pincodes.
func (s *RatesService) Calculate(ctx context.Context, params RateParams) (*RateResult, error) {
	body := rateBody{
		Origin:        params.Origin,
		Destination:   params.Destination,
		Weight:        params.Weight,
		Length:        params.Length,
		Width:         params.Width,
		Height:        params.Height,
		Service:       params.Service,
		COD:           params.COD,
		DeclaredValue: params.DeclaredValue,
	}
	data, err := s.client.do(ctx, http.MethodPost, "/rates/calculate", nil, body, params.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	var out RateResult
	if err := decode(data, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
