package postpin

import (
	"context"
	"net/http"
)

// PlansService lists public subscription plans.
type PlansService struct{ client *Client }

// List returns all public, active subscription plans.
func (s *PlansService) List(ctx context.Context) ([]Plan, error) {
	data, err := s.client.do(ctx, http.MethodGet, "/public/plans", nil, nil, "")
	if err != nil {
		return nil, err
	}
	var out []Plan
	if err := decode(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}
