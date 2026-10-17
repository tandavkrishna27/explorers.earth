import { FC, memo, useEffect, useState } from "react";
import WhiteMap from "../../../../../assets/icons/WhiteMap";
import { getCurrentLocation } from "../../../../../utils/getCurrentLocation";
import { buildGoogleMapsDirectionsUrl } from "../../../../../utils/googleMapsDirections";

export interface AddressProps {
  address: string;
  placeCoordinates: { lat: number; lng: number };
}

// type for coordiante State
export type coordinatesState = {
  lat: number;
  lng: number;
};

const Address: FC<AddressProps> = memo(({ address, placeCoordinates }) => {
  const [coordinates, setCoordinates] = useState<coordinatesState | undefined>(
    undefined
  );

  useEffect(() => {
    // Get current location and set coordinates
    const fetchLocation = async () => {
      const location = await getCurrentLocation();
      if (location) {
        setCoordinates({ lat: location.latitude, lng: location.longitude });
      }
    };

    fetchLocation();
  }, []);

  const directionsUrl = buildGoogleMapsDirectionsUrl(placeCoordinates, coordinates);

  return (
    <div className="p-4 min-h-screen overflow-x-hidden">
      <div className="flex gap-4">
        <WhiteMap color="var(--dash-text)" />
        <a
          target="_blank"
          className="font-poppins hover:text-dashboard-light text-sm text-dashboard flex-1 break-words"
          {...(directionsUrl ? { href: directionsUrl } : { "aria-disabled": true })}
        >
          {address}
        </a>
      </div>
    </div>
  );
});

export default Address;
