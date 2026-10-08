import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';

const EMAIL = 'admin@glamours.com';
const PASS = 'glamours123';

const app = initializeApp({ projectId: 'glamours-control', apiKey: 'fake', authDomain: 'fake' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(db, 'localhost', 8080);

const nombres = [
  'María González', 'Carlos López', 'Ana Martínez', 'Pedro Rodríguez', 'Laura Sánchez',
  'Diego Fernández', 'Carmen Díaz', 'Javier Torres', 'Isabel Ramírez', 'Ricardo Flores',
  'Patricia Morales', 'Fernando Ortiz', 'Silvia Castro', 'Andrés Silva', 'Verónica Reyes',
  'Héctor Mendoza', 'Alicia Vargas', 'Raúl Guzmán', 'Elena Fuentes', 'Oscar Medina',
  'Lorena Aguilar', 'Martín Soto', 'Gabriela Campos', 'Pablo Herrera', 'Daniela Miranda',
  'Emilio Ríos', 'Fernanda Núñez', 'Jorge Cortés', 'Adriana Paredes', 'Sergio Valdez',
  'Mónica Bravo', 'Alejandro Fuentes', 'Paula Ibarra', 'Roberto Camacho', 'Natalia Delgado',
  'Guillermo Peña', 'Victoria Sosa', 'Ignacio Cervantes', 'Romina Maldonado', 'Facundo Acosta',
  'Antonella Roldán', 'Maximiliano Pardo', 'Julieta Cárdenas', 'Tomás Herrera', 'Lucía Montes',
  'Benjamín Serrano', 'Martina Espinoza', 'Joaquín Tovar', 'Catalina Pizarro', 'Felipe Arce',
  'Valentina Salazar', 'Cristian Bravo', 'Renata Molina', 'Gonzalo Pacheco', 'Josefa Contreras',
];

const cumples = [];
let idx = 0;
for (let mes = 0; mes < 12; mes++) {
  const cantidad = 3 + (mes % 3);
  for (let i = 0; i < cantidad; i++) {
    const dia = 1 + ((idx * 7 + mes * 3) % 28);
    cumples.push({
      nombre: nombres[idx % nombres.length],
      dia,
      mes,
      estado: idx % 5 === 0 ? 2 : 1,
    });
    idx++;
  }
}

const nino = [
  { nombre: 'Thiago Ramírez', fecha: '15/08' },
  { nombre: 'Bianca Gutiérrez', fecha: '18/08' },
  { nombre: 'Dante Morales', fecha: '20/08' },
  { nombre: 'Emma Suárez', fecha: '22/08' },
  { nombre: 'Bautista Ríos', fecha: '25/08' },
  { nombre: 'Olivia Mendoza', fecha: '28/08' },
];

const navidad = [
  { nombre: 'Familia González', fecha: '24/12' },
  { nombre: 'Familia Rodríguez', fecha: '24/12' },
  { nombre: 'Familia Pérez', fecha: '25/12' },
  { nombre: 'Familia Sánchez', fecha: '25/12' },
  { nombre: 'Familia Torres', fecha: '31/12' },
  { nombre: 'Familia Flores', fecha: '31/12' },
];

await signInWithEmailAndPassword(auth, EMAIL, PASS);

for (const [tipo, personas] of Object.entries({ cumple: cumples, nino, navidad })) {
  await setDoc(doc(db, 'luxcar_personas', tipo), {
    personas,
    cantidad: personas.length,
    actualizado: new Date().toISOString(),
  });
}

const porMes = {};
for (const p of cumples) porMes[p.mes] = (porMes[p.mes] || 0) + 1;

console.log('Sembrado con datos en TODOS los meses:');
console.log('  cumples :', cumples.length, JSON.stringify(porMes));
console.log('  nino    :', nino.length);
console.log('  navidad :', navidad.length);
process.exit(0);
