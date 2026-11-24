import { Outlet } from "react-router";
import { TabBar } from "../components/TabBar";
import styles from "./layouts.module.css";

/** Con menú inferior: Inicio, Planes, Yo y sus pantallas hijas. */
export function TabLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}

/** A pantalla completa, sin menú: meditación, charlas, entrevista y activación. */
export function FullLayout() {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
