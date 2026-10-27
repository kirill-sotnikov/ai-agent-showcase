import { ServiceStatus } from "../components/service-status";
import * as styles from "./page.css";

const HomePage = () => {
  return (
    <main className={styles.main}>
      <h1>AI Agent Showcase</h1>
      <p>The workspace is ready. Build your AI shopping assistant here.</p>
      <ServiceStatus />
    </main>
  );
};

export default HomePage;
