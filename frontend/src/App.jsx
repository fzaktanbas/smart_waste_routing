import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// -----------------------------------------
// KONTEYNER MARKER'I
// -----------------------------------------

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

// -----------------------------------------
// ARAÇ MARKER'I
// -----------------------------------------

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

// -----------------------------------------
// APP
// -----------------------------------------

function App() {
  // -----------------------------------------
  // STATE'LER
  // -----------------------------------------

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [containers, setContainers] = useState([]);
  const [selectedContainers, setSelectedContainers] = useState([]);

  // Kapasite kontrolü sonucu
  const [capacityResult, setCapacityResult] = useState(null);

  // Oluşturulan rota bilgisi
  const [routeResult, setRouteResult] = useState(null);

  // Rota oluşturulurken yüklenme durumu
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);

  // Rota oluşturma hatası
  const [routeError, setRouteError] = useState(null);

  // -----------------------------------------
  // ROTA KOORDİNATLARINI LEAFLET FORMATINA ÇEVİR
  // -----------------------------------------

  // ORS GeoJSON koordinatları:
  // [longitude, latitude]
  //
  // Leaflet koordinatları:
  // [latitude, longitude]

  const routePositions = routeResult?.geometry?.coordinates
    ? routeResult.geometry.coordinates.map(([longitude, latitude]) => [
        latitude,
        longitude,
      ])
    : [];

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

    // Araç değişince eski konteyner seçimlerini temizle
    setSelectedContainers([]);

    // Eski kapasite sonucunu temizle
    setCapacityResult(null);

    // Eski rota sonucunu temizle
    setRouteResult(null);

    // Eski rota hatasını temizle
    setRouteError(null);
  };

  // -----------------------------------------
  // KONTEYNER SEÇ / SEÇİMDEN ÇIKAR
  // -----------------------------------------

  const handleContainerSelect = (container) => {
    setRouteResult(null);
    setRouteError(null);
    setCapacityResult(null);

    setSelectedContainers((currentSelected) => {
      const alreadySelected = currentSelected.some(
        (selected) => selected.id === container.id,
      );

      if (alreadySelected) {
        return currentSelected.filter(
          (selected) => selected.id !== container.id,
        );
      }

      return [...currentSelected, container];
    });
  };

  // -----------------------------------------
  // OTOMATİK KAPASİTE KONTROLÜ
  // -----------------------------------------

  useEffect(() => {
    // Araç veya konteyner seçilmemişse
    // API isteği gönderme
    if (!selectedVehicle || selectedContainers.length === 0) {
      return;
    }

    const containerIds = selectedContainers.map((container) => container.id);

    fetch("http://127.0.0.1:8000/route/check-capacity", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        vehicle_id: selectedVehicle.id,
        container_ids: containerIds,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Kapasite kontrolü başarısız oldu");
        }

        return response.json();
      })

      .then((data) => {
        console.log("KAPASİTE SONUCU:", data);

        setCapacityResult(data);
      })

      .catch((error) => {
        console.error("Kapasite kontrolü yapılamadı:", error);

        setCapacityResult(null);
      });
  }, [selectedVehicle, selectedContainers]);

  // -----------------------------------------
  // ROTA OLUŞTUR
  // -----------------------------------------

  const handleCreateRoute = async () => {
    // Araç seçilmemişse işlem yapma
    if (!selectedVehicle) {
      return;
    }

    // Konteyner seçilmemişse işlem yapma
    if (selectedContainers.length === 0) {
      return;
    }

    // Seçilen konteynerlerin ID'lerini al
    const containerIds = selectedContainers.map((container) => container.id);

    try {
      // Yüklenme durumunu başlat
      setIsCreatingRoute(true);

      // Eski hata ve rota sonucunu temizle
      setRouteError(null);
      setRouteResult(null);

      // Backend'e rota isteği gönder
      const response = await fetch(
        `http://127.0.0.1:8000/routes/${selectedVehicle.id}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            container_ids: containerIds,
          }),
        },
      );

      // Backend hata döndürdüyse
      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.detail || "Rota oluşturulamadı");
      }

      // Backend'den gelen rota verisini al
      const data = await response.json();

      console.log("ROTA SONUCU:", data);

      // Rota sonucunu state'e kaydet
      setRouteResult(data);
    } catch (error) {
      console.error("Rota oluşturma hatası:", error);

      // Hatayı ekranda göstermek için kaydet
      setRouteError(error.message);
    } finally {
      // İşlem tamamlandı
      setIsCreatingRoute(false);
    }
  };

  // -----------------------------------------
  // EKRAN
  // -----------------------------------------

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
      {/* SEÇİLEN KONTEYNER VE KAPASİTE */}
      {/* -------------------------------- */}

      {selectedVehicle && (
        <div className="selection-info">
          <strong>Seçilen konteyner:</strong> {selectedContainers.length}
          {capacityResult && (
            <>
              <br />
              <strong>Toplam atık:</strong> {capacityResult.total_waste_amount}{" "}
              L
              <br />
              <strong>Araç kapasitesi:</strong>{" "}
              {capacityResult.vehicle_capacity} L
              <br />
              <strong>Kalan kapasite:</strong>{" "}
              {capacityResult.remaining_capacity} L
              <br />
              <br />
              {capacityResult.capacity_ok ? (
                <strong>✅ Araç kapasitesi uygun</strong>
              ) : (
                <strong>❌ Araç kapasitesi yetersiz</strong>
              )}
            </>
          )}
        </div>
      )}

      {/* -------------------------------- */}
      {/* ROTA OLUŞTUR BUTONU */}
      {/* -------------------------------- */}

      {selectedVehicle && (
        <button
          onClick={handleCreateRoute}
          disabled={
            selectedContainers.length === 0 ||
            !capacityResult?.capacity_ok ||
            isCreatingRoute
          }
        >
          {isCreatingRoute ? "Rota Oluşturuluyor..." : "Rota Oluştur"}
        </button>
      )}

      {/* -------------------------------- */}
      {/* ROTA HATASI */}
      {/* -------------------------------- */}

      {routeError && <div className="route-error">❌ {routeError}</div>}

      {/* -------------------------------- */}
      {/* ROTA SONUCU */}
      {/* -------------------------------- */}

      {routeResult && (
        <div className="route-result">
          <h2>🚛 Rota Oluşturuldu</h2>

          <p>
            <strong>Araç:</strong> {routeResult.vehicle_name}
          </p>

          <p>
            <strong>Toplam Atık:</strong> {routeResult.total_waste_amount} L
          </p>

          <p>
            <strong>Kalan Kapasite:</strong> {routeResult.remaining_capacity} L
          </p>

          <p>
            <strong>Mesafe:</strong>{" "}
            {(routeResult.distance_meters / 1000).toFixed(2)} km
          </p>

          <p>
            <strong>Tahmini Süre:</strong>{" "}
            {(routeResult.duration_seconds / 60).toFixed(1)} dakika
          </p>
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
            {/* OLUŞTURULAN ROTA ÇİZGİSİ */}
            {/* -------------------------------- */}

            {routePositions.length > 0 && (
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: "#2563eb",
                  weight: 5,
                  opacity: 0.8,
                }}
              />
            )}

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
                    // Mouse üzerine gelince popup aç
                    mouseover: (event) => {
                      event.target.openPopup();
                    },

                    // Mouse ayrılınca popup kapat
                    mouseout: (event) => {
                      event.target.closePopup();
                    },

                    // Tıklayınca konteyneri seç / kaldır
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
