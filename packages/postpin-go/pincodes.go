package postpin

import (
	"context"
	"net/http"
	"net/url"
)

// PincodesService looks up the pincode directory.
type PincodesService struct{ client *Client }

// Get looks up a single pincode, including nearby serviceable pincodes.
func (s *PincodesService) Get(ctx context.Context, code string) (*Pincode, error) {
	data, err := s.client.do(ctx, http.MethodGet, "/public/pincodes/"+url.PathEscape(code), nil, nil, "")
	if err != nil {
		return nil, err
	}
	var out Pincode
	if err := decode(data, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// States lists every state with its serviceable-pincode counts.
func (s *PincodesService) States(ctx context.Context) ([]StateSummary, error) {
	data, err := s.client.do(ctx, http.MethodGet, "/public/pincodes/states", nil, nil, "")
	if err != nil {
		return nil, err
	}
	var out []StateSummary
	if err := decode(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}
