import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// =====================================================
// KONTEYNER MARKER'I
// =====================================================

const createContainerIcon = (fillLevel, selected = false) => {
  let color = "#6f8f63";

  if (fillLevel >= 80) {
    color = "#b94a48";
  } else if (fillLevel >= 50) {
    color = "#c88b45";
  }

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div class="container-marker ${selected ? "selected" : ""}" 
           style="--marker-color: ${color}">
        <span class="marker-bin">♻</span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
};

// =====================================================
// ARAÇ MARKER'I
// =====================================================

const createVehicleIcon = () => {
  return L.divIcon({
    className: "vehicle-marker-wrapper",
    html: `
      <div class="vehicle-marker">
        <span>🚛</span>
      </div>
    `,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -26],
  });
};

// =====================================================
// HARİTAYI SEÇİLEN ARACA GÖTÜR
// =====================================================

function VehicleMapController({ vehicle }) {
  const map = useMap();

  useEffect(() => {
    if (vehicle?.latitude && vehicle?.longitude) {
      map.flyTo([vehicle.latitude, vehicle.longitude], 16, {
        duration: 1.2,
      });
    }
  }, [vehicle, map]);

  return null;
}

// =====================================================
// ANA UYGULAMA
// =====================================================

function App() {
  // ---------------------------------------------------
  // STATE'LER
  // ---------------------------------------------------

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [containers, setContainers] = useState([]);
  const [selectedContainers, setSelectedContainers] = useState([]);

  const [capacityResult, setCapacityResult] = useState(null);

  const [routeResult, setRouteResult] = useState(null);
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);
  const [routeError, setRouteError] = useState(null);

  // İlk ekran / harita ekranı
  const [showMap, setShowMap] = useState(false);

  // Dropdown açık mı?
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  // ---------------------------------------------------
  // SAATİ BUL
  // ---------------------------------------------------

  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return "Günaydın";
    }

    if (hour >= 12 && hour < 18) {
      return "İyi günler";
    }

    if (hour >= 18 && hour < 23) {
      return "İyi akşamlar";
    }

    return "İyi geceler";
  };

  // ---------------------------------------------------
  // ROTA KOORDİNATLARI
  // ---------------------------------------------------

  const routePositions = routeResult?.geometry?.coordinates
    ? routeResult.geometry.coordinates.map(([longitude, latitude]) => [
        latitude,
        longitude,
      ])
    : [];

  // ---------------------------------------------------
  // ARAÇLARI GETİR
  // ---------------------------------------------------

  useEffect(() => {
    fetch("http://127.0.0.1:8000/vehicles")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Araçlar alınamadı");
        }

        return response.json();
      })
      .then((data) => {
        console.log("ARAÇ VERİLERİ:", data);
        setVehicles(data);
      })
      .catch((error) => {
        console.error("Araçlar alınamadı:", error);
      });
  }, []);

  // ---------------------------------------------------
  // KONTEYNERLERİ GETİR
  // ---------------------------------------------------

  useEffect(() => {
    fetch("http://127.0.0.1:8000/containers")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Konteynerler alınamadı");
        }

        return response.json();
      })
      .then((data) => {
        console.log("CONTAINER VERİLERİ:", data);
        setContainers(data);
      })
      .catch((error) => {
        console.error("Konteynerler alınamadı:", error);
      });
  }, []);

  // ---------------------------------------------------
  // ARAÇ SEÇ
  // ---------------------------------------------------

  const handleVehicleSelect = (vehicle) => {
    setSelectedVehicle(vehicle);

    setSelectedContainers([]);
    setCapacityResult(null);
    setRouteResult(null);
    setRouteError(null);

    setVehicleDropdownOpen(false);
  };

  // ---------------------------------------------------
  // İLERİ
  // ---------------------------------------------------

  const handleContinue = () => {
    if (!selectedVehicle) {
      return;
    }

    setShowMap(true);
  };

  // ---------------------------------------------------
  // KONTEYNER SEÇ / SEÇİMDEN ÇIKAR
  // ---------------------------------------------------

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

  // ---------------------------------------------------
  // ROTA OLUŞTUR
  // ---------------------------------------------------

  const handleCreateRoute = async () => {
    if (!selectedVehicle) {
      return;
    }

    if (selectedContainers.length === 0) {
      return;
    }

    if (!capacityResult?.capacity_ok) {
      return;
    }

    const containerIds = selectedContainers.map((container) => container.id);

    try {
      setIsCreatingRoute(true);
      setRouteError(null);
      setRouteResult(null);

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

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.detail || "Rota oluşturulamadı");
      }

      const data = await response.json();

      console.log("ROTA SONUCU:", data);

      setRouteResult(data);
    } catch (error) {
      console.error("Rota oluşturma hatası:", error);

      setRouteError(error.message);
    } finally {
      setIsCreatingRoute(false);
    }
  };

  // ---------------------------------------------------
  // KAPASİTE YÜZDESİ
  // ---------------------------------------------------

  const totalWaste =
    capacityResult?.total_waste_amount ||
    selectedContainers.reduce(
      (total, container) => total + Number(container.capacity || 0),
      0,
    );

  const vehicleCapacity =
    capacityResult?.vehicle_capacity || selectedVehicle?.capacity || 0;

  const capacityPercentage =
    vehicleCapacity > 0
      ? Math.min(Math.round((totalWaste / vehicleCapacity) * 100), 100)
      : 0;

  // =====================================================
  // 1. EKRAN - ARAÇ SEÇİMİ
  // =====================================================

  if (!showMap) {
    return (
      <div className="welcome-screen">
        {/* Bulanık harita arka planı */}
        <div className="welcome-map-background">
          <MapContainer
            center={[38.3552, 38.3095]}
            zoom={14}
            zoomControl={false}
            attributionControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            keyboard={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </MapContainer>
        </div>

        <div className="welcome-overlay"></div>

        {/* Ana içerik */}
        <div className="welcome-content">
          <div className="welcome-header">
            <h1>Belediye Çöp Toplama Sistemi</h1>

            <p>Akıllı atık yönetimi ve rota planlama platformu</p>
          </div>

          <div className="vehicle-card">
            <div className="vehicle-card-title">
              <div className="title-icon">🚛</div>

              <div>
                <h2>Araç Seçiniz</h2>
                <span>Rota oluşturmak için bir araç seçin</span>
              </div>
            </div>

            <div className="vehicle-select-area">
              <label>MEVCUT ARAÇLAR</label>

              <div className="custom-select">
                <button
                  className={`select-trigger ${
                    vehicleDropdownOpen ? "open" : ""
                  }`}
                  onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                >
                  <div className="selected-vehicle-content">
                    <span className="truck-small">🚛</span>

                    <div>
                      {selectedVehicle ? (
                        <>
                          <strong>{selectedVehicle.name}</strong>

                          <small>
                            {selectedVehicle.plate_number} ·{" "}
                            {selectedVehicle.capacity} L
                          </small>
                        </>
                      ) : (
                        <span className="placeholder">Bir araç seçin...</span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`select-arrow ${
                      vehicleDropdownOpen ? "rotate" : ""
                    }`}
                  >
                    ↓
                  </span>
                </button>

                {vehicleDropdownOpen && (
                  <div className="vehicle-options">
                    {vehicles.length === 0 ? (
                      <div className="no-vehicles">Araçlar yükleniyor...</div>
                    ) : (
                      vehicles.map((vehicle) => (
                        <button
                          key={vehicle.id}
                          className={`vehicle-option ${
                            selectedVehicle?.id === vehicle.id ? "selected" : ""
                          }`}
                          onClick={() => handleVehicleSelect(vehicle)}
                        >
                          <span className="option-icon">🚛</span>

                          <span className="option-info">
                            <strong>{vehicle.name}</strong>

                            <small>Plaka: {vehicle.plate_number}</small>
                          </span>

                          <span className="option-capacity">
                            {vehicle.capacity} L
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedVehicle && (
              <div className="selected-preview">
                <div>
                  <span>Seçilen araç</span>
                  <strong>{selectedVehicle.plate_number}</strong>
                </div>

                <div>
                  <span>Kapasite</span>
                  <strong>{selectedVehicle.capacity} L</strong>
                </div>
              </div>
            )}

            <div className="continue-area">
              <button
                className="continue-button"
                disabled={!selectedVehicle}
                onClick={handleContinue}
                title={selectedVehicle ? "Haritaya geç" : "Önce araç seçiniz"}
              >
                <span>İleri</span>
                <span className="continue-arrow">→</span>
              </button>
            </div>
          </div>
        </div>

        <div className="system-status">
          <span className="status-dot"></span>
          Sistem Çevrimiçi
        </div>
      </div>
    );
  }

  // =====================================================
  // 2. EKRAN - HARİTA
  // =====================================================

  return (
    <div className="map-page">
      {/* TAM EKRAN HARİTA */}

      <MapContainer
        key={selectedVehicle.id}
        center={[selectedVehicle.latitude, selectedVehicle.longitude]}
        zoom={16}
        className="main-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <VehicleMapController vehicle={selectedVehicle} />

        {/* ARAÇ */}

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

        {/* ROTA */}

        {routePositions.length > 0 && (
          <Polyline
            positions={routePositions}
            pathOptions={{
              color: "#695e3f",
              weight: 6,
              opacity: 0.85,
            }}
          />
        )}

        {/* KONTEYNERLER */}

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
                mouseover: (event) => {
                  event.target.openPopup();
                },

                mouseout: (event) => {
                  event.target.closePopup();
                },

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
                <strong>{isSelected ? "✓ Seçildi" : "Tıklayarak seç"}</strong>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* ------------------------------------------------ */}
      {/* SOL ÜST BİLGİ KARTI */}
      {/* ------------------------------------------------ */}

      <div className="vehicle-info-floating">
        <div className="greeting">{getGreeting()}</div>

        <div className="vehicle-info-line">
          <span>Plaka</span>
          <strong>{selectedVehicle.plate_number}</strong>
        </div>

        <div className="vehicle-info-line">
          <span>Kapasite</span>
          <strong>{selectedVehicle.capacity} L</strong>
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* GERİ DÖN */}
      {/* ------------------------------------------------ */}

      <button className="back-button" onClick={() => setShowMap(false)}>
        ← Araç Değiştir
      </button>

      {/* ------------------------------------------------ */}
      {/* SAĞ ALT ROTA KARTI */}
      {/* ------------------------------------------------ */}

      <div className="route-card">
        <div className="route-card-header">
          <div>
            <span className="route-card-label">ROTA PLANI</span>

            <h2>Seçim Özeti</h2>
          </div>

          <button
            className="create-route-button"
            disabled={
              selectedContainers.length === 0 ||
              !capacityResult?.capacity_ok ||
              isCreatingRoute
            }
            onClick={handleCreateRoute}
          >
            {isCreatingRoute ? (
              <>
                <span className="loading-spinner"></span>
                Oluşturuluyor
              </>
            ) : (
              <>
                <span>↗</span>
                Rota Oluştur
              </>
            )}
          </button>
        </div>

        <div className="route-stats">
          <div className="route-stat">
            <span className="stat-icon">♙</span>

            <div>
              <span>Seçilen Konteyner</span>

              <strong>
                {selectedContainers.length} <small>Adet</small>
              </strong>
            </div>
          </div>

          <div className="route-stat">
            <span className="stat-icon">◉</span>

            <div>
              <span>Toplam Atık</span>

              <strong>
                {totalWaste.toLocaleString("tr-TR")} <small>L</small>
              </strong>
            </div>
          </div>
        </div>

        {/* KAPASİTE */}

        <div className="capacity-section">
          <div className="capacity-header">
            <span>ARAÇ DOLULUĞU</span>

            <strong>
              {totalWaste.toLocaleString("tr-TR")} L{" "}
              <small>/ {vehicleCapacity.toLocaleString("tr-TR")} L</small>
            </strong>
          </div>

          <div className="capacity-bar">
            <div
              className={`capacity-fill ${
                capacityPercentage >= 80
                  ? "danger"
                  : capacityPercentage >= 50
                    ? "warning"
                    : ""
              }`}
              style={{
                width: `${capacityPercentage}%`,
              }}
            ></div>
          </div>

          <div className="capacity-bottom">
            <span>{capacityPercentage}% dolu</span>

            {capacityResult && (
              <span
                className={
                  capacityResult.capacity_ok ? "capacity-ok" : "capacity-danger"
                }
              >
                {capacityResult.capacity_ok
                  ? "Kapasite uygun"
                  : "Kapasite yetersiz"}
              </span>
            )}
          </div>
        </div>

        {/* ROTA SONUCU */}

        {routeResult && (
          <div className="route-success">
            <div className="success-title">✓ Rota oluşturuldu</div>

            <div className="route-result-grid">
              <div>
                <span>Mesafe</span>
                <strong>
                  {(routeResult.distance_meters / 1000).toFixed(2)} km
                </strong>
              </div>

              <div>
                <span>Tahmini Süre</span>
                <strong>
                  {(routeResult.duration_seconds / 60).toFixed(1)} dk
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* ROTA HATASI */}

        {routeError && <div className="route-error">❌ {routeError}</div>}
      </div>
    </div>
  );
}

export default App;
