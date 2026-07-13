package postpin

import (
	"context"
	"net/http"
	"net/url"
)

// ServiceabilityService checks pincode serviceability.
type ServiceabilityService struct{ client *Client }

// Check reports whether a pincode is serviceable.
func (s *ServiceabilityService) Check(ctx context.Context, pincode string) (*Serviceability, error) {
	data, err := s.client.do(ctx, http.MethodGet, "/public/serviceability/"+url.PathEscape(pincode), nil, nil, "")
	if err != nil {
		return nil, err
	}
	var out Serviceability
	if err := decode(data, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
