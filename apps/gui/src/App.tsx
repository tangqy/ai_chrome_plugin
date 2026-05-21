import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Layout from './components/Layout';
import ServicePanel from './pages/ServicePanel';
import GitPanel from './pages/GitPanel';
import AgentPanel from './pages/AgentPanel';
import LogsPanel from './pages/LogsPanel';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/service" replace />} />
              <Route path="service" element={<ServicePanel />} />
              <Route path="git" element={<GitPanel />} />
              <Route path="logs" element={<LogsPanel />} />
              <Route path="agent" element={<AgentPanel />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
