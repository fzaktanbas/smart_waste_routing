import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const createContainerIcon = (fillLevel) => {
  let color = "#22c55e";

  if (fillLevel >= 80) {
    color = "#ef4444";
  } else if (fillLevel >= 50) {
    color = "#f97316";
  }

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const createVehicleIcon = () => {
  return L.divIcon({
    className: "vehicle-marker",
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background-color: #2563eb;
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        position: relative;
      ">
        <div style="
          width: 10px;
          height: 10px;
          background-color: white;
          border-radius: 50%;
          position: absolute;
          top: 10px;
          left: 10px;
        "></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [containers, setContainers] = useState([]);

  // Araçları getir
  useEffect(() => {
    fetch("http://127.0.0.1:8000/vehicles")
      .then((response) => response.json())
      .then((data) => {
        console.log("ARAÇ VERİLERİ:", data);
        setVehicles(data);
      })
      .catch((error) => {
        console.error("Araçlar alınamadı:", error);
      });
  }, []);

  // Konteynerleri getir
  useEffect(() => {
    fetch("http://127.0.0.1:8000/containers")
      .then((response) => response.json())
      .then((data) => {
        console.log("CONTAINER VERİLERİ:", data);
        setContainers(data);
      })
      .catch((error) => {
        console.error("Konteynerler alınamadı:", error);
      });
  }, []);

  const handleVehicleSelect = (event) => {
    const vehicleId = Number(event.target.value);

    const vehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

    setSelectedVehicle(vehicle);
  };

  return (
    <div className="app">
      <h1>Smart Waste Routing</h1>

      <div className="vehicle-selection">
        <h2>Araç Seçimi</h2>

        <select
          value={selectedVehicle?.id || ""}
          onChange={handleVehicleSelect}
        >
          <option value="">Araç seçiniz</option>

          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name} - {vehicle.plate_number}
            </option>
          ))}
        </select>

        {selectedVehicle && (
          <div className="vehicle-info">
            <strong>{selectedVehicle.name}</strong>
            <br />
            Plaka: {selectedVehicle.plate_number}
            <br />
            Kapasite: {selectedVehicle.capacity} L
            <br />
            Durum: {selectedVehicle.status}
          </div>
        )}
      </div>

      {selectedVehicle && (
        <div className="map-container">
          <MapContainer
            center={[selectedVehicle.latitude, selectedVehicle.longitude]}
            zoom={16}
            style={{ height: "500px", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* SEÇİLEN ARAÇ */}
            <Marker
              position={[selectedVehicle.latitude, selectedVehicle.longitude]}
              icon={createVehicleIcon()}
            >
              <Popup>
                <strong>{selectedVehicle.name}</strong>
                <br />
                Plaka: {selectedVehicle.plate_number}
                <br />
                Kapasite: {selectedVehicle.capacity} L
                <br />
                Durum: {selectedVehicle.status}
              </Popup>
            </Marker>

            {/* KONTEYNERLER */}
            {containers.map((container) => (
              <Marker
                key={container.id}
                position={[container.latitude, container.longitude]}
                icon={createContainerIcon(container.fill_level)}
              >
                <Popup>
                  <strong>{container.name}</strong>
                  <br />
                  Doluluk: %{container.fill_level}
                  <br />
                  Kapasite: {container.capacity} L
                  <br />
                  Durum: {container.status}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default App;
