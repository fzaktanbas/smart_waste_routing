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

function App() {
  const [containers, setContainers] = useState([]);

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

  return (
    <div className="app">
      <h1>Smart Waste Routing</h1>

      <div className="map-container">
        <MapContainer
          center={[38.3552, 38.3095]}
          zoom={16}
          style={{ height: "500px", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

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
    </div>
  );
}

export default App;
