import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const createContainerIcon = (fillLevel, selected = false) => {
  let color = "#22c55e";

  if (fillLevel >= 80) {
    color = "#ef4444";
  } else if (fillLevel >= 50) {
    color = "#f97316";
  }

  return L.divIcon({
    className: "custom-marker",

    html: `
      <div style="
        background-color: ${selected ? "#2563eb" : color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 4px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      "></div>
    `,

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

  const [selectedContainers, setSelectedContainers] = useState([]);

  // -----------------------------------------
  // ARAÇLARI GETİR
  // -----------------------------------------

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

  // -----------------------------------------
  // KONTEYNERLERİ GETİR
  // -----------------------------------------

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

  // -----------------------------------------
  // ARAÇ SEÇ
  // -----------------------------------------

  const handleVehicleSelect = (event) => {
    const vehicleId = Number(event.target.value);

    const vehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

    setSelectedVehicle(vehicle);

    // Araç değiştiğinde
    // konteyner seçimlerini sıfırla
    setSelectedContainers([]);
  };

  // -----------------------------------------
  // KONTEYNER SEÇ / SEÇİMDEN ÇIKAR
  // -----------------------------------------

  const handleContainerSelect = (container) => {
    setSelectedContainers((currentSelected) => {
      const alreadySelected = currentSelected.some(
        (selected) => selected.id === container.id,
      );

      // Zaten seçiliyse seçimden çıkar
      if (alreadySelected) {
        return currentSelected.filter(
          (selected) => selected.id !== container.id,
        );
      }

      // Seçili değilse ekle
      return [...currentSelected, container];
    });
  };

  // -----------------------------------------
  // TOPLAM ATIK MİKTARI
  // -----------------------------------------

  const totalWasteAmount = selectedContainers.reduce((total, container) => {
    return total + (container.capacity * container.fill_level) / 100;
  }, 0);

  return (
    <div className="app">
      <h1>Smart Waste Routing</h1>

      {/* -------------------------------- */}
      {/* ARAÇ SEÇİMİ */}
      {/* -------------------------------- */}

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

      {/* -------------------------------- */}
      {/* SEÇİLEN KONTEYNER BİLGİSİ */}
      {/* -------------------------------- */}

      {selectedVehicle && (
        <div className="selection-info">
          <strong>Seçilen konteyner:</strong> {selectedContainers.length}
          <br />
          <strong>Toplam atık:</strong> {totalWasteAmount.toFixed(0)} L
        </div>
      )}

      {/* -------------------------------- */}
      {/* HARİTA */}
      {/* -------------------------------- */}

      {selectedVehicle && (
        <div className="map-container">
          <MapContainer
            center={[selectedVehicle.latitude, selectedVehicle.longitude]}
            zoom={16}
            style={{
              height: "500px",
              width: "100%",
            }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* -------------------------------- */}
            {/* SEÇİLEN ARAÇ */}
            {/* -------------------------------- */}

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

            {/* -------------------------------- */}
            {/* KONTEYNERLER */}
            {/* -------------------------------- */}

            {containers.map((container) => {
              const isSelected = selectedContainers.some(
                (selected) => selected.id === container.id,
              );

              return (
                <Marker
                  key={container.id}
                  position={[container.latitude, container.longitude]}
                  icon={createContainerIcon(container.fill_level, isSelected)}
                  eventHandlers={{
                    // Mouse üzerine gelince
                    // popup aç
                    mouseover: (event) => {
                      event.target.openPopup();
                    },

                    // Mouse ayrılınca
                    // popup kapat
                    mouseout: (event) => {
                      event.target.closePopup();
                    },

                    // Tıklayınca seç
                    click: () => {
                      handleContainerSelect(container);
                    },
                  }}
                >
                  <Popup>
                    <strong>{container.name}</strong>
                    <br />
                    Doluluk: %{container.fill_level}
                    <br />
                    Kapasite: {container.capacity} L
                    <br />
                    Durum: {container.status}
                    <br />
                    <br />
                    <strong>
                      {isSelected ? "✓ Seçildi" : "Tıklayarak seç"}
                    </strong>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default App;
