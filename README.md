
# TelDirectory - Corporate Phone Directory

TelDirectory is a Next.js web application designed to manage and display a corporate phone directory. It reads directory data from XML files, allowing users to navigate through zones, branches (for specific zones like "Zona Metropolitana"), and localities to find phone extensions. The application also provides an interface to import and manage these XML files, and a search feature to quickly find departments (localities) or extensions.

## Core Features:

*   **Hierarchical Directory**: Navigate through Zones, Branches (where applicable), and Localities.
*   **Extension Listing**: View department/contact names and their phone extensions.
*   **XML-Based Data**: Directory data is stored in XML files, following Cisco IP Phone standards.
*   **Web Interface**: Browse the directory through a user-friendly web interface.
*   **Global Search**: A search bar on the homepage allows users to quickly find departments (localities) by name, or specific extensions by their name/role or number, across the entire directory.
*   **Authentication**:
    *   A simple login system protects administrative features.
    *   The default password for initial setup is `admin123`. **It is strongly recommended to change this** by setting the `ADMIN_PASSWORD` environment variable in your production environment.
    *   Authenticated users can access the "Settings" page for XML import, configuration, and data management.
    *   Guest users can only browse the directory.
*   **Data Management (Authenticated Users Only)**:
    *   Import XML files for zone branches and departments.
    *   Add, edit, and delete zones, branches, localities, and extensions directly through the web UI.
*   **Customization**:
    *   Dark Mode support.
    *   Language toggle (English/Español).
    *   Configurable root path for the directory data via the Settings page. The application expects the `MainMenu.xml` file to be PascalCase and structural directory names like `zonebranch`, `branch`, `department` to be in **lowercase** within this root path.
    *   Configuration for the Host IP/Hostname and Port used in the URLs of the XML files (relevant for IP phone service, applied via Settings page).

## Project Structure

*   `src/app/`: Contains the Next.js App Router pages.
    *   `src/app/[zoneId]/...`: Dynamic routes for displaying zone, branch, and locality pages.
    *   `src/app/import-xml/`: Page for settings, XML import, and application configuration (protected).
    *   `src/app/login/`: Login page.
*   `src/components/`: Reusable React components, including global search (`src/components/search/GlobalSearch.tsx`).
*   `src/lib/`: Core logic, data fetching utilities (`data.ts`), server actions (`actions.ts`, `auth-actions.ts`), and configuration management (`config.ts`).
*   `src/context/`: React context for language management.
*   `src/hooks/`: Custom React hooks.
*   `src/locales/`: JSON files for internationalization (i18n).
*   `src/middleware.ts`: Handles route protection for authenticated areas.
*   `ivoxsdir/` (Default location, configurable): **Crucial directory** for storing all XML data.
    *   `ivoxsdir/MainMenu.xml`: The root XML file for the directory structure (ensure this filename is PascalCase: `MainMenu.xml`).
    *   `ivoxsdir/zonebranch/`: Contains XML files for each zone (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) (ensure this directory name is lowercase: `zonebranch`).
    *   `ivoxsdir/branch/`: Contains XML files for branches, primarily used by Zona Metropolitana (e.g., `AdmCorporativo.xml`) (ensure this directory name is lowercase: `branch`).
    *   `ivoxsdir/department/`: Contains XML files for each locality/department, listing extensions (e.g., `Bavaro.xml`) (ensure this directory name is lowercase: `department`).
*   `.config/directory.config.json`: Stores the custom path to the `ivoxsdir` data if specified in Settings.
*   `public/`: Static assets.

## Setup and Installation

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. `ivoxsdir` Directory Setup

The application relies on XML files. By default, it looks for a directory named `ivoxsdir` at the root of your project. You can change this path via the application's Settings page (after logging in).

*   **Create the `ivoxsdir` directory** (or your custom named directory) at the root of your project or at your chosen custom location.
*   Inside `ivoxsdir`, create the following subdirectories **using lowercase names**:
    *   `zonebranch`
    *   `branch`
    *   `department`
*   **Populate with XML files**:
    *   Place your `MainMenu.xml` file (ensure filename is PascalCase: `MainMenu.xml`) in the `ivoxsdir` directory.
    *   Place your zone-specific XML files (e.g., `ZonaEste.xml`, `ZonaMetropolitana.xml`) in `ivoxsdir/zonebranch/`.
    *   Place your branch-specific XML files (e.g., for Zona Metropolitana's sub-menus like `AdmCendis.xml`) in `ivoxsdir/branch/`.
    *   Place your department/locality XML files (listing extensions) in `ivoxsdir/department/`.

    *The application includes sample XML files in the `IVOXS` directory in the initial project structure. You should rename this to `ivoxsdir` (or your custom name), ensure the structural subdirectories (`zonebranch`, `branch`, `department`) are lowercase and `MainMenu.xml` is PascalCase, and replace these with your actual directory data.*

## Running the Application

### Development Environment (Prueba)

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically start on `http://localhost:3000` (port configured in `package.json`).

2.  **Accessing the App:**
    *   Web UI: Open `http://localhost:3000` in your browser.
    *   To access administrative features, navigate to `/login` and use the password `admin123` (or the one set via `ADMIN_PASSWORD` environment variable).

3.  **Data Management:**
    *   The application reads XML files from the configured `ivoxsdir` path.
    *   Any changes made via the UI (adding/editing/deleting items by an authenticated user) will directly modify these XML files.

### Production Environment (Productivo)

1.  **Set Environment Variables (Recommended):**
    *   Create a `.env.local` file in your project root (this file should not be committed to Git).
    *   Set the `ADMIN_PASSWORD` to a strong, unique password:
        ```
        ADMIN_PASSWORD=your_secure_password_here
        ```

2.  **Build the Application:**
    ```bash
    npm run build
    ```
    This command creates an optimized production build in the `.next` directory.

3.  **Start the Production Server:**
    ```bash
    npm run start
    ```
    The application will start on port `3000` (as configured in `package.json`).

4.  **Deployment Considerations:**
    *   **`ivoxsdir` Directory**: The `ivoxsdir` directory (with all its XML files and correct casing for subfolders: `zonebranch`, `branch`, `department` as lowercase, and `MainMenu.xml` as PascalCase) **must be present at the location specified in the application's settings** (or at the project root if using the default). The application reads these files at runtime. If you configured a custom absolute path in settings, ensure that path is accessible to the production server process and the user running the Node.js process has read and write permissions to this directory and its contents.
    *   **Firewall**: Make sure your server's firewall allows incoming connections on the port the application is running on (e.g., port 3000).
    *   **Process Manager**: For long-running production deployments, use a process manager like PM2.
        ```bash
        pm2 start npm --name "teldirectory" -- run start
        ```

5.  **Accessing in Production:**
    *   Web UI: `http://YOUR_SERVER_IP_OR_DOMAIN:3000`
    *   Login at `http://YOUR_SERVER_IP_OR_DOMAIN:3000/login` using the password set in `ADMIN_PASSWORD`.

## Using the Import Feature (Authenticated Users)

The "Settings" page (`/import-xml`) allows authenticated users to upload XML files directly:

*   **Import Zone Branch XML**: Upload XML files for specific zones (e.g., `ZonaEste.xml`). These will be saved to `[ivoxsdir_root]/zonebranch/`. The filename (without `.xml`) is used as the ID.
*   **Import Department XML Files**: Upload XML files for departments/localities (e.g., `Bavaro.xml`). These will be saved to `[ivoxsdir_root]/department/`. The filename (without `.xml`) is used as the ID.

**Caution**: Importing files will overwrite existing files with the same name in the target directory.

## Search Functionality

*   **Global Search (Homepage)**: The homepage features a prominent search bar. Users can type to search for:
    *   Department/Locality names.
    *   Extension names/roles (e.g., "Sales CAJ1", "John Doe").
    *   Extension numbers.
    Search results will display matching localities, highlighting the part that matched (locality name or specific extension details), and provide a direct link to the locality's page.

*   **Zone-Specific Search**: Each zone page features a search bar that allows users to quickly find localities or branches (if applicable, like in Zona Metropolitana) within that specific zone by name or ID.

## XML Structure

The application reads and writes XML data structured for Cisco IP Phones:

*   **Menu Structure (`CiscoIPPhoneMenu`)**: Used for `MainMenu.xml`, `zonebranch/*.xml`, and `branch/*.xml`. Contains `<MenuItem>` elements with `<Name>` and `<URL>`.
*   **Directory Structure (`CiscoIPPhoneDirectory`)**: Used for `department/*.xml`. Contains `<DirectoryEntry>` elements with `<Name>` (department/contact) and `<Telephone>` (extension).

Refer to Cisco IP Phone documentation for detailed XML specifications if needed.
